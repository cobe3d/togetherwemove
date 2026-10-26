// 打鼓示範模式：正面坐著、左右交替拍肩的虛擬長輩骨架
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const REST = 1.0, RAISE = 0.9, HOLD = 0.5, LOWER = 0.9;
  const CYCLE = REST + RAISE + HOLD + LOWER;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

  class DemoDrumPose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.repOffset = 0;
      this.headDropReps = new Set([9]);
      this.tiltReps = new Set([13]);
      this.shortReps = new Set([11]);  // 這一下沒拍到位置
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }
    start(nowMs, repOffset) { this.active = true; this.t0 = nowMs; if (repOffset != null) this.repOffset = repOffset; }
    idle() { this.active = false; }

    pose(nowMs) {
      if (!this.active) return { hand: 'R', p: 0, idx: -1 };
      const t = Math.max(0, (nowMs - this.t0) / 1000);
      const k = Math.floor(t / CYCLE);
      const u = t - k * CYCLE;
      const idx = this.repOffset + k;
      let p;
      if (u < REST) p = 0;
      else if (u < REST + RAISE) p = ease((u - REST) / RAISE);
      else if (u < REST + RAISE + HOLD) p = 1;
      else p = 1 - ease((u - REST - RAISE - HOLD) / LOWER);
      return { hand: idx % 2 === 0 ? 'R' : 'L', p, idx };
    }

    read(nowMs) {
      const { hand, p, idx } = this.pose(nowMs);
      return buildDrumLandmarks({
        hand, p,
        headDrop: this.headDropReps.has(idx),
        tilt: this.tiltReps.has(idx),
        short: this.shortReps.has(idx)
      }, this.noise);
    }
  }

  // 畫面座標（已左右翻轉）：長輩的右邊在畫面右邊
  function buildDrumLandmarks(o, noisy) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.6 : 0);
    const P = (pt, v) => ({ x: pt.x + n(), y: pt.y + n(), visibility: v });
    const p = o.p || 0;
    const tiltPx = o.tilt ? 28 * p : 0;
    const LS = { x: 540, y: 330 - tiltPx }, RS = { x: 740, y: 330 + tiltPx };
    const N = { x: 640, y: 225 + (o.headDrop ? 55 * p : 0) };
    const rest = {
      LE: { x: 515, y: 455 }, RE: { x: 765, y: 455 },
      LW: { x: 575, y: 560 }, RW: { x: 705, y: 560 }
    };
    const pts = Object.assign({}, rest);
    if (o.hand === 'R') {
      const tgt = o.short ? { x: LS.x + 85, y: LS.y + 25 } : { x: LS.x + 25, y: LS.y + 10 };
      const w = lerp(rest.RW, tgt, p);
      pts.RW = { x: w.x, y: w.y - 30 * Math.sin(Math.PI * p) };
      pts.RE = lerp(rest.RE, { x: 668, y: 432 }, p);
    } else {
      const tgt = o.short ? { x: RS.x - 85, y: RS.y + 25 } : { x: RS.x - 25, y: RS.y + 10 };
      const w = lerp(rest.LW, tgt, p);
      pts.LW = { x: w.x, y: w.y - 30 * Math.sin(Math.PI * p) };
      pts.LE = lerp(rest.LE, { x: 612, y: 432 }, p);
    }

    const lm = [];
    for (let i = 0; i < 33; i++) lm.push({ x: 640, y: 360, visibility: 0.05 });
    lm[0] = P(N, 0.98);
    lm[7] = P({ x: N.x - 45, y: N.y + 7 }, 0.9);
    lm[8] = P({ x: N.x + 45, y: N.y + 7 }, 0.9);
    lm[11] = P(LS, 0.97);
    lm[12] = P(RS, 0.97);
    lm[13] = P(pts.LE, 0.95);
    lm[14] = P(pts.RE, 0.95);
    lm[15] = P(pts.LW, 0.93);
    lm[16] = P(pts.RW, 0.93);
    lm[23] = P({ x: 570, y: 580 }, 0.8);
    lm[24] = P({ x: 710, y: 580 }, 0.8);
    lm[25] = P({ x: 560, y: 680 }, 0.6);
    lm[26] = P({ x: 720, y: 680 }, 0.6);
    return lm;
  }

  RCDD.DemoDrumPose = DemoDrumPose;
  RCDD.buildDrumLandmarks = buildDrumLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoDrumPose, buildDrumLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
