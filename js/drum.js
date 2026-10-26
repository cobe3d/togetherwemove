// 打鼓（跨體拍肩）的動作判斷：正面骨架特徵、拍肩狀態機、每一下評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const opp = h => (h === 'R' ? 'L' : 'R');
  // 手 → 要拍的肩膀（右手拍左肩）
  const HAND = { L: { wrist: 15, elbow: 13, target: 12 }, R: { wrist: 16, elbow: 14, target: 11 } };

  // ---------- 特徵 ----------
  class DrumFeatureExtractor {
    constructor(cfg) { this.cfg = cfg; }
    reset() {}

    extract(lm) {
      if (!lm || lm.length < 25) return null;
      const LS = lm[11], RS = lm[12], N = lm[0];
      const sw = geo.dist(LS, RS) || 1;
      const mid = { x: (LS.x + RS.x) / 2, y: (LS.y + RS.y) / 2 };
      const visible = vis(LS) > 0.5 && vis(RS) > 0.5 && vis(N) > 0.5;
      const hands = {};
      for (const h of ['L', 'R']) {
        const w = lm[HAND[h].wrist], tgt = lm[HAND[h].target];
        const seen = vis(w) > 0.3;
        hands[h] = {
          d: seen ? geo.dist(w, tgt) / sw : Infinity,
          crossed: seen && (w.x - mid.x) * (tgt.x - mid.x) > 0,
          rest: !seen || w.y > mid.y + this.cfg.restDrop * sw
        };
      }
      return {
        visible,
        frontal: Math.abs(N.x - mid.x) / sw < 0.18 && Math.min(vis(LS), vis(RS)) > 0.7,
        sw,
        mid,
        tilt: Math.atan2(RS.y - LS.y, RS.x - LS.x) * 180 / Math.PI,
        noseLift: (mid.y - N.y) / sw,
        hands,
        points: {
          LS, RS, N, LE: lm[13], RE: lm[14], LW: lm[15], RW: lm[16], LH: lm[23], RH: lm[24]
        }
      };
    }
  }

  function snap(f) {
    return { sw: f.sw, tilt: f.tilt, noseLift: f.noseLift };
  }

  // ---------- 狀態機 ----------
  // 亮起一邊的鼓 → 用對的手拍到（hit）→ 手放下（rep）→ 換另一邊亮起
  class TapTracker {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg;
      this.calibrating = !!opts.calibrating;
      this.touch = this.calibrating ? cfg.calibTouch : (opts.touch || cfg.defaultTouch);
      this.interval = opts.interval || cfg.interval.start;
      this.baseline = opts.baseline ? Object.assign({}, opts.baseline) : { sw: null, tilt: null, noseLift: null };
      this.reactions = [];
      this.reset();
    }

    reset() {
      this.cue = this.cue || 'R';
      this.phase = 'cue';
      this.cueStart = null;
      this.lastT = null;
      this.lostSince = null;
      this.lostFired = false;
      this.newAttempt();
      this.current = { cue: this.cue, phase: this.phase, d: Infinity, glow: 0 };
    }

    newAttempt() {
      this.att = { raised: false, minD: Infinity, crossed: false, peak: null, wrongs: 0, wrongActive: false, hitT: null, hitD: null };
    }

    update(f, t) {
      const ev = [];
      const cfg = this.cfg;
      this.lastT = t;

      if (!f || !f.visible) {
        if (this.lostSince == null) this.lostSince = t;
        if (!this.lostFired && t - this.lostSince > 1.2) { this.lostFired = true; ev.push({ type: 'lost' }); }
        return ev;
      }
      if (this.lostFired) ev.push({ type: 'found' });
      this.lostSince = null;
      this.lostFired = false;

      const hs = f.hands;
      if (hs.L.rest && hs.R.rest) {
        const b = this.baseline;
        for (const k of ['sw', 'tilt', 'noseLift']) b[k] = b[k] == null ? f[k] : b[k] + (f[k] - b[k]) * 0.1;
      }

      if (this.cueStart == null) {
        this.cueStart = t;
        ev.push({ type: 'cue', hand: this.cue });
      }

      const h = this.cue, a = this.att, me = hs[h], other = hs[opp(h)];
      this.current.d = me.d;

      if (this.phase === 'cue') {
        if (!me.rest) a.raised = true;
        if (me.d < a.minD) { a.minD = me.d; a.crossed = me.crossed; a.peak = snap(f); }

        // 用錯手
        if (other.crossed && other.d < this.touch) {
          if (!a.wrongActive) { a.wrongActive = true; a.wrongs++; ev.push({ type: 'wrong', hand: opp(h) }); }
        } else if (other.rest) {
          a.wrongActive = false;
        }

        if (me.crossed && me.d < this.touch) {
          a.hitT = t;
          a.hitD = me.d;
          a.peak = snap(f);
          this.phase = 'lower';
          ev.push({ type: 'hit', hand: h, reaction: t - this.cueStart });
        } else if (a.raised && me.rest) {
          // 舉起又放下但沒拍到：距離夠近仍算 1 下，太遠就再試一次
          if (a.minD < this.touch * cfg.countRatio || this.calibrating) this.pushRep(ev, t, false);
          else { ev.push({ type: 'miss', hand: h, minD: a.minD }); this.newAttempt(); }
        }
      } else if (this.phase === 'lower') {
        // 拍到後繼續記錄最靠近的距離，直到手放下
        if (me.d < a.minD) { a.minD = me.d; a.peak = snap(f); }
        if (me.rest) this.pushRep(ev, t, true);
      }

      this.current.cue = this.cue;
      this.current.phase = this.phase;
      this.current.glow = this.phase === 'lower' ? 1 : clamp((this.touch * 2.2 - me.d) / (this.touch * 1.2), 0, 1);
      return ev;
    }

    // 完成 1 下，接著亮起另一邊的鼓
    pushRep(ev, t, hit) {
      ev.push(this.finishRep(t, hit));
      ev.push({ type: 'cue', hand: this.cue });
    }

    finishRep(t, hit) {
      const a = this.att;
      const reaction = (hit ? a.hitT : t) - this.cueStart;
      const rep = { hand: this.cue, hit, minD: a.minD, reaction, wrongs: a.wrongs, peak: a.peak };
      const score = scoreTap(rep, this.touch, this.cfg, this.baseline, this.interval);
      if (!this.calibrating) {
        this.reactions.push(reaction);
        this.interval = adaptInterval(this.interval, this.reactions.slice(-3), this.cfg);
      }
      // 換另一邊
      this.cue = opp(this.cue);
      this.phase = 'cue';
      this.cueStart = t;
      this.newAttempt();
      return { type: 'rep', rep, score, next: this.cue };
    }
  }

  // 依最近 3 下的反應時間調整鼓點快慢
  function adaptInterval(interval, recent, cfg) {
    if (recent.length < 3) return interval;
    const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
    if (avg < interval * 0.6) return Math.max(cfg.interval.min, +(interval * 0.9).toFixed(2));
    if (avg > interval * 1.4) return Math.min(cfg.interval.max, +(interval * 1.1).toFixed(2));
    return interval;
  }

  function scoreTap(rep, touch, cfg, baseline, interval) {
    const w = cfg.weights;
    const good = Math.min(0.25, touch * 0.6);
    const reachRatio = rep.minD <= good ? 1 : clamp(1 - 0.5 * (rep.minD - good) / (touch - good), 0.3, 1);
    const faults = [];
    const p = rep.peak;
    if (p && baseline) {
      for (const c of cfg.checks) {
        if (c.type === 'trunkRotate' && baseline.sw && p.sw / baseline.sw < c.ratio) faults.push(c);
        if (c.type === 'trunkTilt' && baseline.tilt != null && Math.abs(p.tilt - baseline.tilt) > c.maxDelta) faults.push(c);
        if (c.type === 'headDrop' && baseline.noseLift && p.noseLift / baseline.noseLift < c.ratio) faults.push(c);
      }
    }
    const reach = Math.round(w.reach * reachRatio);
    const form = Math.max(0, w.form - faults.reduce((s, c) => s + c.penalty, 0));
    const timing = Math.round(w.timing * clamp(1 - (rep.reaction - interval) / cfg.timingZeroAfter, 0, 1));
    const alternate = Math.max(0, w.alternate - 5 * rep.wrongs);
    return {
      reach, form, timing, alternate,
      total: reach + form + timing + alternate,
      faults: faults.map(c => c.type),
      faultVoice: faults.length ? faults[0].voice : null,
      hit: rep.hit,
      minD: rep.minD,
      reaction: rep.reaction
    };
  }

  function summarizeDrum(scores, cfg) {
    const n = scores.length;
    const avg = k => (n ? Math.round(scores.reduce((s, x) => s + x[k], 0) / n) : 0);
    const parts = { reach: avg('reach'), form: avg('form'), timing: avg('timing'), alternate: avg('alternate') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    let combo = 0, maxCombo = 0;
    for (const s of scores) { combo = s.hit ? combo + 1 : 0; maxCombo = Math.max(maxCombo, combo); }
    return {
      reps: n,
      parts,
      total: n ? parts.reach + parts.form + parts.timing + parts.alternate : 0,
      hits: scores.filter(s => s.hit).length,
      maxCombo,
      onBeat: n ? Math.round(100 * scores.filter(s => s.timing === cfg.weights.timing).length / n) : 0,
      avgReaction: n ? +(scores.reduce((s, x) => s + x.reaction, 0) / n).toFixed(1) : 0,
      faultCounts
    };
  }

  // 個人判定距離：能力測量中最遠的一次 × 1.25，介於 0.3 與 0.8 倍肩寬
  function computeTouch(minDs, cfg) {
    const finite = minDs.filter(x => isFinite(x));
    if (!finite.length) return cfg.maxTouch;
    return +clamp(Math.max(...finite) * cfg.touchBonus, cfg.minTouch, cfg.maxTouch).toFixed(2);
  }

  RCDD.drum = { HAND, DrumFeatureExtractor, TapTracker, scoreTap, adaptInterval, summarizeDrum, computeTouch };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.drum;
})(typeof window !== 'undefined' ? window : globalThis);
