// 彈鋼琴（手指對指）的動作判斷：手部特徵、對指狀態機、每回評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // MediaPipe 手部 21 點：4 拇指尖、8 食指尖、12 中指尖、16 無名指尖、20 小指尖
  const TIP = { I: 8, M: 12, R: 16, P: 20 };
  const FINGERS = ['I', 'M', 'R', 'P'];
  const NAME = { T: '拇指', I: '食指', M: '中指', R: '無名指', P: '小指' };

  // ---------- 特徵 ----------
  class HandFeatureExtractor {
    reset() {}
    extract(lm) {
      if (!lm || lm.length < 21) return null;
      const palm = geo.dist(lm[0], lm[9]) || 1;
      const d = {};
      for (const k of FINGERS) d[k] = geo.dist(lm[4], lm[TIP[k]]) / palm;
      return {
        visible: true,
        palm,
        d,
        // 中指尖在手腕上方 = 手指朝上
        upright: lm[12].y < lm[0].y - palm * 0.8,
        points: lm
      };
    }
  }

  // ---------- 狀態機 ----------
  // 亮起一隻手指 → 拇指碰到（touch）→ 手指張開 → 下一隻；整個順序碰完 = 1 回（round）
  class FingerTracker {
    constructor(cfg, opts) {
      opts = opts || {};
      this.cfg = cfg;
      this.calibrating = !!opts.calibrating;
      this.touch = this.calibrating ? cfg.calibTouch : (opts.touch || cfg.defaultTouch);
      this.open = Math.max(cfg.open, this.touch + cfg.openMargin);
      this.sequence = opts.sequence || cfg.sequences.oneway;
      this.fingers = opts.fingers || cfg.fingers || FINGERS;   // 要檢查的手指（雙手聯彈多了拇指）
      this.reset();
    }

    reset() {
      this.idx = 0;
      this.contact = null;     // 現在正碰著的手指
      this.last = null;        // 上一下碰的手指
      this.sep = 0;            // 上一下之後，拇指離開那隻手指的最大距離
      this.lastTouchT = null;
      this.pendingRound = false;
      this.wrongActive = {};
      this.lostSince = null;
      this.lostFired = false;
      this.round = { touches: [], wrongs: 0 };
      this.current = { target: this.sequence[0], idx: 0, contact: null };
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

      const d = f.d;
      // 正碰著的手指：記錄最靠近的距離，離開就放開
      if (this.contact) {
        const rec = this.round.touches[this.round.touches.length - 1];
        if (rec && rec.finger === this.contact && d[this.contact] < rec.minD) rec.minD = d[this.contact];
        if (d[this.contact] > this.touch * 1.3) {
          this.contact = null;
          if (this.pendingRound) ev.push(this.finishRound());
        }
      }
      if (this.last) this.sep = Math.max(this.sep, d[this.last]);

      if (!this.pendingRound) {
        const target = this.sequence[this.idx];
        // 碰錯手指：拇指明顯碰在別隻手指上（能力測量時判定很寬，不檢查）
        const wrongThr = Math.min(this.touch, cfg.defaultTouch + 0.05);
        for (const g of this.fingers) {
          // 上一隻剛碰過的手指還沒離開，不算碰錯
          if (this.calibrating || g === target || g === this.contact || g === this.last) continue;
          if (d[g] < wrongThr && d[g] < d[target]) {
            if (!this.wrongActive[g]) { this.wrongActive[g] = true; this.round.wrongs++; ev.push({ type: 'wrong', finger: g, expect: target }); }
          } else if (d[g] > wrongThr * 1.3) {
            this.wrongActive[g] = false;
          }
        }
        // 碰到目標手指（拇指直接從上一隻滑過來也算，但「手指張開」分數會較低）
        const free = !this.contact || (this.contact !== target && d[target] < d[this.contact]);
        if (free && d[target] < this.touch && !this.wrongActive[target]) {
          const openRatio = this.last ? clamp((this.sep - this.touch) / (this.open - this.touch), 0, 1) : 1;
          const interval = this.lastTouchT == null ? null : t - this.lastTouchT;
          this.round.touches.push({ finger: target, minD: d[target], openRatio, interval });
          // 碰的當下還貼著拇指的其他手指，要先離開才會被當成碰錯
          for (const g of this.fingers) if (g !== target && d[g] < wrongThr * 1.3) this.wrongActive[g] = true;
          this.contact = target;
          this.last = target;
          this.sep = 0;
          this.lastTouchT = t;
          ev.push({ type: 'touch', finger: target, step: this.idx });
          this.idx++;
          if (this.idx >= this.sequence.length) this.pendingRound = true;
        }
      }
      this.current = { target: this.sequence[this.idx % this.sequence.length], idx: this.idx, contact: this.contact, pending: this.pendingRound };
      return ev;
    }

    // 最後一隻手指放開後，才算完成這一回
    finishRound() {
      const r = this.round;
      const score = scoreRound(r, this.touch, this.cfg);
      this.round = { touches: [], wrongs: 0 };
      this.idx = 0;
      this.pendingRound = false;
      return { type: 'rep', rep: r, score };
    }
  }

  function scoreRound(r, touch, cfg) {
    const w = cfg.weights;
    const n = r.touches.length || 1;
    const good = touch * 0.5;
    const reachRatio = r.touches.reduce((s, x) => s + (x.minD <= good ? 1 : clamp(1 - 0.5 * (x.minD - good) / (touch - good), 0.5, 1)), 0) / n;
    const openRatio = r.touches.reduce((s, x) => s + x.openRatio, 0) / n;
    const ivs = r.touches.map(x => x.interval).filter(x => x != null);
    const tempoRatio = ivs.length ? ivs.reduce((s, iv) => {
      if (iv < cfg.tempo.min) return s + clamp((iv - 0.2) / (cfg.tempo.min - 0.2), 0, 1);
      if (iv > cfg.tempo.max) return s + clamp(1 - (iv - cfg.tempo.max) / 4, 0, 1);
      return s + 1;
    }, 0) / ivs.length : 1;
    const faults = [];
    if (r.wrongs > 0) faults.push(cfg.checks.find(c => c.type === 'wrongFinger'));
    if (openRatio < 0.6) faults.push(cfg.checks.find(c => c.type === 'noOpen'));
    const reach = Math.round(w.reach * reachRatio);
    const order = Math.max(0, w.order - 10 * r.wrongs);
    const open = Math.round(w.open * openRatio);
    const tempo = Math.round(w.tempo * tempoRatio);
    const perFinger = {};
    for (const x of r.touches) perFinger[x.finger] = Math.min(perFinger[x.finger] == null ? Infinity : perFinger[x.finger], x.minD);
    return {
      reach, order, open, tempo,
      total: reach + order + open + tempo,
      faults: faults.map(c => c.type),
      faultVoice: faults.length ? faults[0].voice : null,
      notes: r.touches.length,
      perFinger
    };
  }

  function summarizePiano(scores, cfg) {
    const n = scores.length;
    const avg = (list, k) => (list.length ? Math.round(list.reduce((s, x) => s + x[k], 0) / list.length) : 0);
    const parts = { reach: avg(scores, 'reach'), order: avg(scores, 'order'), open: avg(scores, 'open'), tempo: avg(scores, 'tempo') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    // 每隻手指平均能碰到多近，最遠的就是最難碰的
    const sums = {}, counts = {};
    for (const s of scores) for (const k in s.perFinger) { sums[k] = (sums[k] || 0) + s.perFinger[k]; counts[k] = (counts[k] || 0) + 1; }
    let hardest = null;
    for (const k in sums) if (!hardest || sums[k] / counts[k] > sums[hardest] / counts[hardest]) hardest = k;
    const byHand = h => scores.filter(s => s.hand === h);
    const handTotal = h => {
      const l = byHand(h);
      return l.length ? avg(l, 'total') : null;
    };
    return {
      reps: n,
      parts,
      total: n ? parts.reach + parts.order + parts.open + parts.tempo : 0,
      notes: scores.reduce((s, x) => s + x.notes, 0),
      right: handTotal('R'),
      left: handTotal('L'),
      hardest,
      faultCounts
    };
  }

  // 個人判定：能力測量中最難碰的手指 × 1.3，介於 0.22 與 0.6 倍手掌大小
  function computeTouch(minDs, cfg) {
    const finite = minDs.filter(x => isFinite(x));
    if (!finite.length) return cfg.maxTouch;
    return +clamp(Math.max(...finite) * cfg.touchBonus, cfg.minTouch, cfg.maxTouch).toFixed(2);
  }

  RCDD.piano = { TIP, FINGERS, NAME, HandFeatureExtractor, FingerTracker, scoreRound, summarizePiano, computeTouch };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.piano;
})(typeof window !== 'undefined' ? window : globalThis);
