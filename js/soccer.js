// 踢足球（站姿往前踢腿，正面）的動作判斷：腳踝踢多高、左右交替狀態機、每一下評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const opp = h => (h === 'R' ? 'L' : 'R');
  const IDX = { L: { hip: 23, knee: 25, ankle: 27 }, R: { hip: 24, knee: 26, ankle: 28 } };

  // ---------- 特徵 ----------
  class SoccerFeatureExtractor {
    reset() {}
    extract(lm) {
      if (!lm || lm.length < 29) return null;
      const LS = lm[11], RS = lm[12], N = lm[0];
      const sw = geo.dist(LS, RS) || 1;
      const mid = { x: (LS.x + RS.x) / 2, y: (LS.y + RS.y) / 2 };
      const legs = {};
      for (const s of ['L', 'R']) {
        const i = IDX[s];
        const hip = lm[i.hip], knee = lm[i.knee], ankle = lm[i.ankle];
        legs[s] = {
          // 腳踝、膝蓋比臀部高多少（肩寬為單位）；站著時都是負的，往前踢時變大
          a: (hip.y - ankle.y) / sw,
          rel: (hip.y - knee.y) / sw,
          vis: Math.min(vis(hip), vis(knee), vis(ankle)),
          hip, knee, ankle
        };
      }
      const hipMid = { x: (legs.L.hip.x + legs.R.hip.x) / 2, y: (legs.L.hip.y + legs.R.hip.y) / 2 };
      return {
        visible: vis(LS) > 0.5 && vis(RS) > 0.5 && legs.L.vis > 0.5 && legs.R.vis > 0.5,
        frontal: Math.abs(N.x - mid.x) / sw < 0.2 && Math.min(vis(LS), vis(RS)) > 0.7,
        sw,
        legs,
        trunk: (hipMid.y - mid.y) / sw,            // 身體往後仰時，上身看起來變短
        tilt: Math.atan2(RS.y - LS.y, RS.x - LS.x) * 180 / Math.PI,
        points: { LS, RS, N }
      };
    }
  }

  // ---------- 狀態機 ----------
  // 提示一隻腳 → 往前踢（踢到目標高度 = 射門）→ 收回 = 1 下 → 換另一隻腳
  class SoccerTracker {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg;
      this.calibrating = !!opts.calibrating;
      const t = opts.targets || {};
      const d = cfg.defaultTarget;
      this.targets = this.calibrating ? { L: cfg.maxTarget, R: cfg.maxTarget } : { L: t.L || d, R: t.R || d };
      this.baseline = opts.baseline ? JSON.parse(JSON.stringify(opts.baseline))
        : { a: { L: null, R: null }, rel: { L: null, R: null }, trunk: null, tilt: null };
      this.cue = 'R';
      this.reset();
    }

    reset() {
      this.state = 'ready';
      this.rep = null;
      this.cueStart = null;
      this.lostSince = null;
      this.lostFired = false;
      this.wrongActive = false;
      this.current = { cue: this.cue, kick: 0, progress: 0, reached: false };
    }

    // 腳踝比平常站著時高多少
    kick(f, s) {
      const b = this.baseline.a[s];
      return b == null ? 0 : f.legs[s].a - b;
    }

    knee(f, s) {
      const b = this.baseline.rel[s];
      return b == null ? 0 : f.legs[s].rel - b;
    }

    update(f, t) {
      const ev = [];
      const cfg = this.cfg;
      if (!f || !f.visible) {
        if (this.lostSince == null) this.lostSince = t;
        if (!this.lostFired && t - this.lostSince > 1.2) { this.lostFired = true; ev.push({ type: 'lost' }); }
        return ev;
      }
      if (this.lostFired) ev.push({ type: 'found' });
      this.lostSince = null;
      this.lostFired = false;

      // 兩腳都踩在地上時，記錄平常站著的腳踝、膝蓋高度與站姿；只在腳幾乎沒動時更新
      const b = this.baseline;
      const still = cfg.restBelow * 0.4;
      const calm = s => b.a[s] == null || Math.abs(this.kick(f, s)) < still;
      if (calm('L') && calm('R') && this.state === 'ready') {
        const ema = (old, v) => (old == null ? v : old + (v - old) * 0.1);
        for (const s of ['L', 'R']) {
          b.a[s] = ema(b.a[s], f.legs[s].a);
          b.rel[s] = ema(b.rel[s], f.legs[s].rel);
        }
        b.trunk = ema(b.trunk, f.trunk);
        b.tilt = ema(b.tilt, f.tilt);
      }

      if (this.cueStart == null) { this.cueStart = t; ev.push({ type: 'cue', leg: this.cue }); }

      const h = this.cue;
      const a = this.kick(f, h), o = this.kick(f, opp(h));
      const target = this.targets[h];
      const cur = this.current;
      cur.cue = h;
      cur.kick = a;

      // 踢錯腳
      if (this.state === 'ready' && o > cfg.activeAbove + 0.1) {
        if (!this.wrongActive) { this.wrongActive = true; ev.push({ type: 'wrong', leg: opp(h), expect: h }); }
      } else if (o < cfg.restBelow) {
        this.wrongActive = false;
      }

      if (this.state === 'ready') {
        cur.progress = 0;
        cur.reached = false;
        if (a > cfg.activeAbove && !this.wrongActive) {
          this.state = 'active';
          this.rep = { leg: h, start: t, max: a, high: [], peak: snap(f, a, this.knee(f, h)), reached: false, near: false };
          ev.push({ type: 'start', leg: h });
        }
        return ev;
      }

      const r = this.rep;
      if (a > r.max) { r.max = a; r.peak = snap(f, a, this.knee(f, h)); }
      if (a >= target * cfg.highRatio) r.high.push(snap(f, a, this.knee(f, h)));
      if (!r.reached && a >= target - cfg.reachTolerance) { r.reached = true; ev.push({ type: 'reached', leg: h }); }
      else if (!r.near && !r.reached && a >= target * cfg.nearRatio) { r.near = true; ev.push({ type: 'near', leg: h }); }
      cur.reached = r.reached;
      cur.progress = clamp(r.max / target, 0, 1);

      if (a < cfg.restBelow) {
        this.state = 'ready';
        this.rep = null;
        if (r.max < cfg.minRep) {
          ev.push({ type: 'ignored', leg: h, max: r.max });
        } else {
          const rep = { leg: h, max: r.max, reached: r.reached, duration: t - r.start, high: r.high.length ? r.high : [r.peak] };
          ev.push({ type: 'rep', rep, score: scoreKick(rep, target, cfg, this.baseline) });
          this.cue = opp(h);
          this.cueStart = t;
          ev.push({ type: 'cue', leg: this.cue });
        }
      }
      return ev;
    }
  }

  function snap(f, kick, knee) {
    return { trunk: f.trunk, tilt: f.tilt, bend: kick > 0 ? knee / kick : 0 };
  }

  function scoreKick(rep, target, cfg, baseline) {
    const w = cfg.weights;
    const faults = [];
    for (const c of cfg.checks) {
      if (c.type === 'trunkLean' && baseline.trunk &&
          geo.median(rep.high.map(h => h.trunk / baseline.trunk)) < c.ratio) faults.push(c);
      if (c.type === 'trunkTilt' && baseline.tilt != null &&
          geo.median(rep.high.map(h => Math.abs(h.tilt - baseline.tilt))) > c.maxDelta) faults.push(c);
      if (c.type === 'bentKnee' && geo.median(rep.high.map(h => h.bend)) > c.ratio) faults.push(c);
    }
    const d = rep.duration, tp = cfg.tempo;
    const tempoRatio = d < tp.min ? clamp((d - 0.3) / (tp.min - 0.3), 0, 1) : d > tp.max ? clamp(1 - (d - tp.max) / 4, 0, 1) : 1;
    const rangeRatio = Math.min(rep.max / target, 1);
    const range = Math.round(w.range * rangeRatio);
    const form = Math.max(0, w.form - faults.reduce((s, c) => s + c.penalty, 0));
    const tempo = Math.round(w.tempo * tempoRatio);
    return {
      range, form, tempo,
      total: range + form + tempo,
      faults: faults.map(c => c.type),
      faultVoice: faults.length ? faults[0].voice : null,
      reached: rep.reached,
      percent: Math.round(rangeRatio * 100),
      leg: rep.leg
    };
  }

  function summarizeSoccer(scores, cfg) {
    const n = scores.length;
    const avg = (list, k) => (list.length ? Math.round(list.reduce((s, x) => s + x[k], 0) / list.length) : 0);
    const parts = { range: avg(scores, 'range'), form: avg(scores, 'form'), tempo: avg(scores, 'tempo') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    const leg = h => {
      const l = scores.filter(s => s.leg === h);
      return l.length ? { total: avg(l, 'total'), percent: avg(l, 'percent'), goals: l.filter(s => s.reached).length } : null;
    };
    return {
      reps: n,
      parts,
      total: n ? parts.range + parts.form + parts.tempo : 0,
      goals: scores.filter(s => s.reached).length,
      left: leg('L'),
      right: leg('R'),
      faultCounts
    };
  }

  // 每隻腳的個人目標 = 能力測量最高 + 0.05 肩寬，介於 0.3 與 1.2 之間
  function computeTargets(values, cfg) {
    const out = {};
    for (const h of ['L', 'R']) {
      const list = values.filter(v => v.leg === h).map(v => v.max);
      const best = list.length ? Math.max(...list) : cfg.defaultTarget;
      out[h] = +clamp(best + cfg.targetBonus, cfg.minTarget, cfg.maxTarget).toFixed(2);
    }
    return out;
  }

  RCDD.soccer = { IDX, SoccerFeatureExtractor, SoccerTracker, scoreKick, summarizeSoccer, computeTargets };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.soccer;
})(typeof window !== 'undefined' ? window : globalThis);
