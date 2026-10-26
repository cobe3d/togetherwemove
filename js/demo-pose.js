// 示範模式：沒有鏡頭時，產生一位側身坐著、反覆舉手的虛擬長輩骨架
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const REST = 1.6, RISE = 2.4, HOLD = 2.6, LOWER = 1.5;
  const CYCLE = REST + RISE + HOLD + LOWER;
  const REST_ANGLE = 15;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const DEG = Math.PI / 180;

  class DemoPose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.repOffset = 0;
      // 前 3 下是能力測量，之後是遊戲。第 7、10 下示範代償動作。
      this.peaks = [134, 140, 141, 128, 146, 150, 148, 139, 152, 147, 154, 150, 155, 151, 156];
      this.bendReps = new Set([6]);
      this.leanReps = new Set([9]);
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }

    start(nowMs, repOffset) {
      this.active = true;
      this.t0 = nowMs;
      if (repOffset != null) this.repOffset = repOffset;
    }
    idle() { this.active = false; }

    pose(nowMs) {
      if (!this.active) return { theta: REST_ANGLE, bend: 8, lean: 0 };
      const t = Math.max(0, (nowMs - this.t0) / 1000);
      const k = Math.floor(t / CYCLE);
      const u = t - k * CYCLE;
      const idx = (this.repOffset + k) % this.peaks.length;
      const peak = this.peaks[idx];
      let theta;
      if (u < REST) theta = REST_ANGLE;
      else if (u < REST + RISE) theta = REST_ANGLE + (peak - REST_ANGLE) * ease((u - REST) / RISE);
      else if (u < REST + RISE + HOLD) theta = peak + 1.2 * Math.sin(u * 5);
      else theta = peak - (peak - REST_ANGLE) * ease((u - REST - RISE - HOLD) / LOWER);
      const progress = Math.max(0, Math.min(1, (theta - REST_ANGLE) / (peak - REST_ANGLE)));
      return {
        theta,
        bend: this.bendReps.has(idx) ? 8 + 32 * progress : 8,
        lean: this.leanReps.has(idx) ? 22 * progress : 0
      };
    }

    read(nowMs) {
      const { theta, bend, lean } = this.pose(nowMs);
      return buildLandmarks(theta, bend, lean, this.noise);
    }
  }

  // 畫面座標（已左右翻轉），人朝右側坐
  function buildLandmarks(theta, bend, lean, noisy) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.6 : 0);
    const P = (x, y, v) => ({ x: x + n(), y: y + n(), visibility: v });
    const H = { x: 590, y: 480 };
    const trunk = 165;
    const S = { x: H.x - trunk * Math.sin(lean * DEG), y: H.y - trunk * Math.cos(lean * DEG) };
    const down = { x: (H.x - S.x) / trunk, y: (H.y - S.y) / trunk };
    const armDir = rot(down, -theta * DEG);
    const E = { x: S.x + armDir.x * 115, y: S.y + armDir.y * 115 };
    const foreDir = rot(down, -(theta + bend) * DEG);
    const W = { x: E.x + foreDir.x * 105, y: E.y + foreDir.y * 105 };
    const ear = { x: S.x + 12, y: S.y - 70 };
    const nose = { x: S.x + 41, y: S.y - 62 };
    const K = { x: 722, y: 484 }, A = { x: 726, y: 612 };

    const lm = [];
    for (let i = 0; i < 33; i++) lm.push({ x: 640, y: 360, visibility: 0.05 });
    const near = 0.95, far = 0.35;
    lm[0] = P(nose.x, nose.y, near);
    lm[7] = P(ear.x, ear.y, near);
    lm[11] = P(S.x, S.y, near);
    lm[13] = P(E.x, E.y, near);
    lm[15] = P(W.x, W.y, near);
    lm[23] = P(H.x, H.y, near);
    lm[25] = P(K.x, K.y, near);
    lm[27] = P(A.x, A.y, near);
    // 遠側（被身體擋住）的手放在大腿上
    lm[8] = P(ear.x + 6, ear.y - 3, far);
    lm[12] = P(S.x + 6, S.y - 3, far);
    lm[14] = P(S.x + 21, S.y + 98, far);
    lm[16] = P(S.x + 82, S.y + 130, far);
    lm[24] = P(H.x + 6, H.y - 3, far);
    lm[26] = P(K.x + 6, K.y - 3, far);
    lm[28] = P(A.x + 6, A.y - 3, far);
    return lm;
  }

  RCDD.DemoPose = DemoPose;
  RCDD.buildDemoLandmarks = buildLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoPose, buildLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
