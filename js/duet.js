// 雙手聯彈（雙手手指彎曲）的動作判斷：每隻手指彎多少、左右手輪流的狀態機、每回評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TIP = { T: 4, I: 8, M: 12, R: 16, P: 20 };
  const MCP = { I: 5, M: 9, R: 13, P: 17 };
  const FINGERS = ['T', 'I', 'M', 'R', 'P'];
  // 伸直時的參考值下限（避免一開始手指就彎著，把彎的姿勢當成伸直）
  const OPEN_FLOOR = { T: 1.1, I: 1.6, M: 1.6, R: 1.6, P: 1.5 };
  const FULL = { T: 0.5, I: 1.0, M: 1.0, R: 1.0, P: 1.0 };

  // ---------- 特徵 ----------
  // 輸入 42 個點：前 21 點左手、後 21 點右手（鏡像畫面）
  class DuetFeatureExtractor {
    constructor() { this.reset(); }
    reset() { this.ref = { L: {}, R: {} }; }

    hand(H, side) {
      const palm = geo.dist(H[0], H[9]) || 1;
      const ref = this.ref[side];
      const bend = {};
      for (const k of FINGERS) {
        // 手指：指尖到手腕 ÷ 指根到手腕；拇指：拇指尖到小指根 ÷ 手掌大小。彎下去時都會變小
        const raw = k === 'T'
          ? geo.dist(H[4], H[17]) / palm
          : geo.dist(H[TIP[k]], H[0]) / (geo.dist(H[MCP[k]], H[0]) || 1);
        ref[k] = Math.max(OPEN_FLOOR[k], ref[k] == null ? raw : Math.max(ref[k] * 0.9995, raw));
        bend[k] = clamp((ref[k] - raw) / Math.max(ref[k] - FULL[k], 0.2), 0, 1);
      }
      return {
        palm,
        bend,
        // 中指根在手腕上方 = 手指朝上
        upright: H[9].y < H[0].y - palm * 0.6,
        points: H
      };
    }

    extract(lm) {
      if (!lm || lm.length < 42) return null;
      const L = this.hand(lm.slice(0, 21), 'L'), R = this.hand(lm.slice(21, 42), 'R');
      return { visible: true, palm: (L.palm + R.palm) / 2, hands: { L, R }, upright: L.upright && R.upright };
    }
  }

  // ---------- 狀態機 ----------
  // 每一步：指定一隻手的一隻手指 → 彎下（bend）→ 伸直回來 = 完成這一步；整個順序做完 = 1 回
  class BendTracker {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg;
      this.calibrating = !!opts.calibrating;
      this.thr = this.calibrating ? cfg.calibThr : (opts.thr || cfg.defaultThr);
      const seq = opts.sequence || cfg.sequence;
      this.steps = [];
      for (const f of seq) { this.steps.push({ hand: 'L', f }); this.steps.push({ hand: 'R', f }); }
      this.reset();
    }

    reset() {
      this.idx = 0;
      this.phase = 'wait';
      this.lastBendT = null;
      this.lostSince = null;
      this.lostFired = false;
      this.wrongActive = {};
      this.round = { steps: [], wrongs: 0 };
      this.st = null;
      this.current = { step: this.steps[0], idx: 0, phase: 'wait' };
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

      const step = this.steps[this.idx];
      const other = step.hand === 'L' ? 'R' : 'L';
      const H = f.hands[step.hand].bend, O = f.hands[other].bend;
      const thr = this.thr;

      if (this.phase === 'wait') {
        if (!this.calibrating) {
          // 同一隻手彎錯手指
          for (const k of FINGERS) {
            if (k === step.f) continue;
            const key = step.hand + k;
            if (H[k] >= thr && H[step.f] < thr * 0.8) {
              if (!this.wrongActive[key]) { this.wrongActive[key] = true; this.round.wrongs++; ev.push({ type: 'wrong', hand: step.hand, finger: k, expect: step }); }
            } else if (H[k] < cfg.straight) {
              this.wrongActive[key] = false;
            }
          }
          // 用錯手
          const okey = other + step.f;
          if (O[step.f] >= thr && H[step.f] < thr * 0.8) {
            if (!this.wrongActive[okey]) { this.wrongActive[okey] = true; this.round.wrongs++; ev.push({ type: 'wrongHand', hand: other, finger: step.f, expect: step }); }
          } else if (O[step.f] < cfg.straight) {
            this.wrongActive[okey] = false;
          }
        }
        if (H[step.f] >= thr) {
          this.st = {
            hand: step.hand, f: step.f, depth: H[step.f], others: 0,
            interval: this.lastBendT == null ? null : t - this.lastBendT
          };
          this.lastBendT = t;
          this.phase = 'release';
          ev.push({ type: 'bend', hand: step.hand, finger: step.f, step: this.idx });
        }
      }

      if (this.phase === 'release') {
        const st = this.st;
        st.depth = Math.max(st.depth, H[step.f]);
        for (const k of FINGERS) if (k !== step.f) st.others = Math.max(st.others, H[k]);
        if (H[step.f] < cfg.releaseBelow) {
          this.round.steps.push(st);
          this.st = null;
          this.phase = 'wait';
          this.idx++;
          if (this.idx >= this.steps.length) {
            const r = this.round;
            this.round = { steps: [], wrongs: 0 };
            this.idx = 0;
            ev.push({ type: 'rep', rep: r, score: scoreRound(r, this.thr, cfg) });
          } else {
            ev.push({ type: 'next', step: this.steps[this.idx] });
          }
        }
      }
      this.current = { step: this.steps[this.idx], idx: this.idx, phase: this.phase };
      return ev;
    }
  }

  function scoreRound(r, thr, cfg) {
    const w = cfg.weights;
    const n = r.steps.length || 1;
    const avg = fn => r.steps.reduce((s, x) => s + fn(x), 0) / n;
    // 旁邊手指跟著動一點是正常的，跟著彎超過一半才開始扣
    const indepRatio = avg(x => (x.others < 0.5 ? 1 : clamp(1 - (x.others - 0.5) / 0.4, 0, 1)));
    const goal = Math.min(1, thr + 0.35);
    const depthRatio = avg(x => Math.min(x.depth / goal, 1));
    const ivs = r.steps.map(x => x.interval).filter(x => x != null);
    const tempoRatio = ivs.length ? ivs.reduce((s, iv) => {
      if (iv < cfg.tempo.min) return s + clamp((iv - 0.2) / (cfg.tempo.min - 0.2), 0, 1);
      if (iv > cfg.tempo.max) return s + clamp(1 - (iv - cfg.tempo.max) / 4, 0, 1);
      return s + 1;
    }, 0) / ivs.length : 1;
    const faults = [];
    if (r.wrongs > 0) faults.push(cfg.checks.find(c => c.type === 'wrongFinger'));
    if (indepRatio < 0.7) faults.push(cfg.checks.find(c => c.type === 'otherBent'));
    const correct = Math.max(0, w.correct - 10 * r.wrongs);
    const indep = Math.round(w.indep * indepRatio);
    const depth = Math.round(w.depth * depthRatio);
    const tempo = Math.round(w.tempo * tempoRatio);
    const perFinger = {};
    for (const x of r.steps) perFinger[x.hand + x.f] = Math.max(perFinger[x.hand + x.f] || 0, x.depth);
    return {
      correct, indep, depth, tempo,
      total: correct + indep + depth + tempo,
      faults: faults.map(c => c.type),
      faultVoice: faults.length ? faults[0].voice : null,
      bends: r.steps.length,
      perFinger
    };
  }

  function summarizeDuet(scores, cfg) {
    const n = scores.length;
    const avg = k => (n ? Math.round(scores.reduce((s, x) => s + x[k], 0) / n) : 0);
    const parts = { correct: avg('correct'), indep: avg('indep'), depth: avg('depth'), tempo: avg('tempo') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    // 彎得最淺的手指 = 最難彎
    const sums = {}, counts = {};
    for (const s of scores) for (const k in s.perFinger) { sums[k] = (sums[k] || 0) + s.perFinger[k]; counts[k] = (counts[k] || 0) + 1; }
    let hardest = null, best = 0;
    for (const k in sums) {
      const a = sums[k] / counts[k];
      best = Math.max(best, a);
      if (!hardest || a < sums[hardest] / counts[hardest]) hardest = k;
    }
    // 每隻手指都彎得差不多時，不特別指出哪一隻
    if (hardest && best - sums[hardest] / counts[hardest] < 0.1) hardest = null;
    return {
      reps: n,
      parts,
      total: n ? parts.correct + parts.indep + parts.depth + parts.tempo : 0,
      bends: scores.reduce((s, x) => s + x.bends, 0),
      hardest,
      faultCounts
    };
  }

  // 個人判定：能力測量中最難彎的那隻手指 × 0.6，介於 0.3 與 0.5
  function computeThr(maxBends, cfg) {
    if (!maxBends.length) return cfg.minThr;
    return +clamp(Math.min(...maxBends) * cfg.thrRatio, cfg.minThr, cfg.maxThr).toFixed(2);
  }

  RCDD.duet = { TIP, MCP, FINGERS, DuetFeatureExtractor, BendTracker, scoreRound, summarizeDuet, computeThr };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.duet;
})(typeof window !== 'undefined' ? window : globalThis);
