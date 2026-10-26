// 騎腳踏車示範模式：正面站著、左手扶椅背，左右腳交替把膝蓋抬起再放下的虛擬長輩骨架
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const REST = 0.8, RISE = 0.9, TOP = 0.15, LOWER = 0.9;
  const CYCLE = REST + RISE + TOP + LOWER;
  const SW = 130;   // 肩寬（像素）；站著要拍到全身，人看起來比較小
  const SHIN = 140; // 小腿長（像素）
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));

  class DemoBikePose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.repOffset = 0;
      // 前 4 下是能力測量，之後 10 下是遊戲（膝蓋抬高，以肩寬為單位）
      this.peaks = [0.6, 0.62, 0.58, 0.63,
        0.66, 0.69, 0.64, 0.7, 0.35, 0.68, 0.65, 0.7, 0.67, 0.69, 0.66, 0.71, 0.65, 0.7, 0.68, 0.7, 0.66, 0.71, 0.67, 0.72];
      this.leanReps = new Set([9]);
      this.tiltReps = new Set([11]);
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }
    start(nowMs, repOffset) { this.active = true; this.t0 = nowMs; if (repOffset != null) this.repOffset = repOffset; }
    idle() { this.active = false; }

    pose(nowMs) {
      if (!this.active) return { leg: 'R', lift: 0 };
      const t = Math.max(0, (nowMs - this.t0) / 1000);
      const k = Math.floor(t / CYCLE);
      const u = t - k * CYCLE;
      const idx = this.repOffset + k;
      const peak = this.peaks[idx % this.peaks.length];
      let p;
      if (u < REST) p = 0;
      else if (u < REST + RISE) p = ease((u - REST) / RISE);
      else if (u < REST + RISE + TOP) p = 1;
      else p = 1 - ease((u - REST - RISE - TOP) / LOWER);
      return { leg: idx % 2 === 0 ? 'R' : 'L', lift: peak * p, lean: this.leanReps.has(idx) ? p : 0, tilt: this.tiltReps.has(idx) ? p : 0 };
    }

    read(nowMs) {
      return buildBikeLandmarks(this.pose(nowMs), this.noise);
    }
  }

  // 畫面座標（已左右翻轉）：長輩的右邊在畫面右邊；椅子在畫面左邊，左手扶著椅背
  function buildBikeLandmarks(o, noisy) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.6 : 0);
    const P = (pt, v) => ({ x: pt.x + n(), y: pt.y + n(), visibility: v });
    const leanPx = (o.lean || 0) * 26;     // 往後仰：肩膀往下（上身看起來變短）
    const tiltPx = (o.tilt || 0) * 20;     // 身體歪一邊
    const LS = { x: 575, y: 260 + leanPx - tiltPx }, RS = { x: 705, y: 260 + leanPx + tiltPx };
    const N = { x: 640, y: 190 + leanPx };
    const hips = { L: { x: 600, y: 400 }, R: { x: 680, y: 400 } };
    const leg = s => {
      const up = o.leg === s ? (o.lift || 0) * SW : 0;
      const knee = { x: hips[s].x + (s === 'L' ? -4 : 4), y: 545 - up };
      // 小腿垂下來：抬膝時腳踝跟著膝蓋一起上來
      return { knee, ankle: { x: knee.x, y: knee.y + SHIN } };
    };
    const L = leg('L'), R = leg('R');

    const lm = [];
    for (let i = 0; i < 33; i++) lm.push({ x: 640, y: 360, visibility: 0.05 });
    lm[0] = P(N, 0.98);
    lm[7] = P({ x: N.x - 30, y: N.y + 5 }, 0.9);
    lm[8] = P({ x: N.x + 30, y: N.y + 5 }, 0.9);
    lm[11] = P(LS, 0.97);
    lm[12] = P(RS, 0.97);
    lm[13] = P({ x: 530, y: 335 + leanPx }, 0.95);   // 左手往外扶椅背
    lm[14] = P({ x: 725, y: 335 + leanPx }, 0.95);
    lm[15] = P({ x: 488, y: 392 }, 0.93);
    lm[16] = P({ x: 718, y: 408 }, 0.93);
    lm[23] = P(hips.L, 0.9);
    lm[24] = P(hips.R, 0.9);
    lm[25] = P(L.knee, 0.9);
    lm[26] = P(R.knee, 0.9);
    lm[27] = P(L.ankle, 0.8);
    lm[28] = P(R.ankle, 0.8);
    return lm;
  }

  RCDD.DemoBikePose = DemoBikePose;
  RCDD.buildBikeLandmarks = buildBikeLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoBikePose, buildBikeLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
