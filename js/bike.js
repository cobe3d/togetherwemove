// 騎腳踏車（站姿抬膝，正面）的動作判斷：膝蓋抬多高、左右交替狀態機、每一下評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const opp = h => (h === 'R' ? 'L' : 'R');
  const IDX = { L: { hip: 23, knee: 25, ankle: 27 }, R: { hip: 24, knee: 26, ankle: 28 } };

  // ---------- 特徵 ----------
  class BikeFeatureExtractor {
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
          // 膝蓋比臀部高多少（肩寬為單位）；站著時是負的（膝蓋在臀部下方），抬膝時變大
          rel: (hip.y - knee.y) / sw,
          vis: Math.min(vis(hip), vis(knee)),
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
  // 提示一隻腳 → 膝蓋抬起 → 放下 = 1 下 → 換另一隻腳（不用撐住）
  class LegTracker {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg;
      this.calibrating = !!opts.calibrating;
      const t = opts.targets || {};
      this.targets = this.calibrating ? { L: cfg.maxTarget, R: cfg.maxTarget } : { L: t.L || 0.5, R: t.R || 0.5 };
      this.baseline = opts.baseline ? JSON.parse(JSON.stringify(opts.baseline)) : { rel: { L: null, R: null }, trunk: null, tilt: null };
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
      this.current = { cue: this.cue, lift: 0, progress: 0, reached: false };
    }

    lift(f, s) {
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

      // 兩腳都踩在地上時，記錄平常站著的膝蓋高度與站姿
      const b = this.baseline;
      // 只在膝蓋幾乎沒動時更新，避免剛開始抬腳就把基準拉高
      const still = cfg.restBelow * 0.4;
      const restL = b.rel.L == null || this.lift(f, 'L') < still;
      const restR = b.rel.R == null || this.lift(f, 'R') < still;
      if (restL && restR && this.state === 'ready') {
        for (const s of ['L', 'R']) b.rel[s] = b.rel[s] == null ? f.legs[s].rel : b.rel[s] + (f.legs[s].rel - b.rel[s]) * 0.1;
        b.trunk = b.trunk == null ? f.trunk : b.trunk + (f.trunk - b.trunk) * 0.1;
        b.tilt = b.tilt == null ? f.tilt : b.tilt + (f.tilt - b.tilt) * 0.1;
      }

      if (this.cueStart == null) { this.cueStart = t; ev.push({ type: 'cue', leg: this.cue }); }

      const h = this.cue;
      const a = this.lift(f, h), o = this.lift(f, opp(h));
      const target = this.targets[h];
      this.current.cue = h;
      this.current.lift = a;

      // 抬錯腳
      if (this.state === 'ready' && o > cfg.activeAbove + 0.08) {
        if (!this.wrongActive) { this.wrongActive = true; ev.push({ type: 'wrong', leg: opp(h), expect: h }); }
      } else if (o < cfg.restBelow) {
        this.wrongActive = false;
      }

      if (this.state === 'ready') {
        this.current.progress = 0;
        this.current.reached = false;
        if (a > cfg.activeAbove && !this.wrongActive) {
          this.state = 'active';
          this.rep = { leg: h, start: t, max: a, high: [], peak: snap(f), reached: false, near: false };
          ev.push({ type: 'start', leg: h });
        }
        return ev;
      }

      const r = this.rep;
      if (a > r.max) { r.max = a; r.peak = snap(f); }
      if (a >= target * cfg.highRatio) r.high.push(snap(f));
      if (!r.reached && a >= target - cfg.reachTolerance) { r.reached = true; ev.push({ type: 'reached', leg: h }); }
      else if (!r.near && !r.reached && a >= target * cfg.nearRatio) { r.near = true; ev.push({ type: 'near', leg: h }); }
      this.current.reached = r.reached;
      this.current.progress = clamp(r.max / target, 0, 1);

      if (a < cfg.restBelow) {
        this.state = 'ready';
        this.rep = null;
        if (r.max < cfg.minRep) {
          ev.push({ type: 'ignored', leg: h, max: r.max });
        } else {
          const rep = { leg: h, max: r.max, reached: r.reached, duration: t - r.start, high: r.high.length ? r.high : [r.peak] };
          ev.push({ type: 'rep', rep, score: scoreLift(rep, target, cfg, this.baseline) });
          this.cue = opp(h);
          this.cueStart = t;
          ev.push({ type: 'cue', leg: this.cue });
        }
      }
      return ev;
    }
  }

  function snap(f) {
    return { trunk: f.trunk, tilt: f.tilt };
  }

  function scoreLift(rep, target, cfg, baseline) {
    const w = cfg.weights;
    const faults = [];
    for (const c of cfg.checks) {
      if (c.type === 'trunkLean' && baseline.trunk &&
          geo.median(rep.high.map(h => h.trunk / baseline.trunk)) < c.ratio) faults.push(c);
      if (c.type === 'trunkTilt' && baseline.tilt != null &&
          geo.median(rep.high.map(h => Math.abs(h.tilt - baseline.tilt))) > c.maxDelta) faults.push(c);
    }
    const d = rep.duration, tp = cfg.tempo;
    const tempoRatio = d < tp.min ? clamp((d - 0.4) / (tp.min - 0.4), 0, 1) : d > tp.max ? clamp(1 - (d - tp.max) / 4, 0, 1) : 1;
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

  function summarizeBike(scores, cfg) {
    const n = scores.length;
    const avg = (list, k) => (list.length ? Math.round(list.reduce((s, x) => s + x[k], 0) / list.length) : 0);
    const parts = { range: avg(scores, 'range'), form: avg(scores, 'form'), tempo: avg(scores, 'tempo') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    const leg = h => {
      const l = scores.filter(s => s.leg === h);
      return l.length ? { total: avg(l, 'total'), percent: avg(l, 'percent') } : null;
    };
    return {
      reps: n,
      parts,
      total: n ? parts.range + parts.form + parts.tempo : 0,
      reached: scores.filter(s => s.reached).length,
      left: leg('L'),
      right: leg('R'),
      stops: cfg.stops.filter(s => s.at <= n).map(s => s.name),
      faultCounts
    };
  }

  // 每隻腳的個人目標 = 能力測量最高 + 0.05 肩寬，介於 0.25 與 1.2 之間
  function computeTargets(values, cfg) {
    const out = {};
    for (const h of ['L', 'R']) {
      const list = values.filter(v => v.leg === h).map(v => v.max);
      const best = list.length ? Math.max(...list) : 0.5;
      out[h] = +clamp(best + cfg.targetBonus, cfg.minTarget, cfg.maxTarget).toFixed(2);
    }
    return out;
  }

  RCDD.bike = { IDX, BikeFeatureExtractor, LegTracker, scoreLift, summarizeBike, computeTargets };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.bike;
})(typeof window !== 'undefined' ? window : globalThis);
