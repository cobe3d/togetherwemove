// 踢足球示範模式：正面站著、左手扶椅背，左右腳交替把腳往前踢出去再收回的虛擬長輩骨架
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const REST = 0.8, KICK = 0.6, TOP = 0.15, BACK = 0.7;
  const CYCLE = REST + KICK + TOP + BACK;
  const SW = 130;                 // 肩寬（像素）
  const THIGH = 145, SHIN = 140;  // 大腿、小腿長（像素）
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));

  class DemoSoccerPose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.repOffset = 0;
      // 前 4 下是能力測量，之後 10 下是遊戲（腳踝踢高，以肩寬為單位）
      this.peaks = [0.55, 0.58, 0.52, 0.6, 0.6, 0.62, 0.58, 0.64, 0.3, 0.63, 0.6, 0.64, 0.61, 0.65];
      this.leanReps = new Set([9]);
      this.bentReps = new Set([11]);
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }
    start(nowMs, repOffset) { this.active = true; this.t0 = nowMs; if (repOffset != null) this.repOffset = repOffset; }
    idle() { this.active = false; }

    pose(nowMs) {
      if (!this.active) return { leg: 'R', kick: 0 };
      const t = Math.max(0, (nowMs - this.t0) / 1000);
      const k = Math.floor(t / CYCLE);
      const u = t - k * CYCLE;
      const idx = this.repOffset + k;
      const peak = this.peaks[idx % this.peaks.length];
      let p;
      if (u < REST) p = 0;
      else if (u < REST + KICK) p = ease((u - REST) / KICK);
      else if (u < REST + KICK + TOP) p = 1;
      else p = 1 - ease((u - REST - KICK - TOP) / BACK);
      return { leg: idx % 2 === 0 ? 'R' : 'L', kick: peak * p, lean: this.leanReps.has(idx) ? p : 0, bent: this.bentReps.has(idx) };
    }

    read(nowMs) {
      return buildSoccerLandmarks(this.pose(nowMs), this.noise);
    }
  }

  // 畫面座標（已左右翻轉）：長輩的右邊在畫面右邊；椅子在畫面左邊，左手扶著椅背
  // o.kick：腳踝抬高幾個肩寬；o.bent：彎著膝蓋抬（膝蓋和腳踝抬得一樣多）
  function buildSoccerLandmarks(o, noisy) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.6 : 0);
    const P = (pt, v) => ({ x: pt.x + n(), y: pt.y + n(), visibility: v });
    const leanPx = (o.lean || 0) * 26;
    const LS = { x: 575, y: 260 + leanPx }, RS = { x: 705, y: 260 + leanPx };
    const N = { x: 640, y: 190 + leanPx };
    const hips = { L: { x: 600, y: 400 }, R: { x: 680, y: 400 } };
    const leg = s => {
      const rise = o.leg === s ? (o.kick || 0) * SW : 0;
      // 腳伸直往前踢：膝蓋只抬起腳踝的一半左右
      const kneeRise = o.bent ? rise * 0.95 : rise * THIGH / (THIGH + SHIN);
      const x = hips[s].x + (s === 'L' ? -4 : 4);
      return { knee: { x, y: hips[s].y + THIGH - kneeRise }, ankle: { x, y: hips[s].y + THIGH + SHIN - rise } };
    };
    const L = leg('L'), R = leg('R');

    const lm = [];
    for (let i = 0; i < 33; i++) lm.push({ x: 640, y: 360, visibility: 0.05 });
    lm[0] = P(N, 0.98);
    lm[7] = P({ x: N.x - 30, y: N.y + 5 }, 0.9);
    lm[8] = P({ x: N.x + 30, y: N.y + 5 }, 0.9);
    lm[11] = P(LS, 0.97);
    lm[12] = P(RS, 0.97);
    lm[13] = P({ x: 530, y: 335 + leanPx }, 0.95);
    lm[14] = P({ x: 725, y: 335 + leanPx }, 0.95);
    lm[15] = P({ x: 488, y: 392 }, 0.93);
    lm[16] = P({ x: 718, y: 408 }, 0.93);
    lm[23] = P(hips.L, 0.9);
    lm[24] = P(hips.R, 0.9);
    lm[25] = P(L.knee, 0.9);
    lm[26] = P(R.knee, 0.9);
    lm[27] = P(L.ankle, 0.85);
    lm[28] = P(R.ankle, 0.85);
    return lm;
  }

  RCDD.DemoSoccerPose = DemoSoccerPose;
  RCDD.buildSoccerLandmarks = buildSoccerLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoSoccerPose, buildSoccerLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
