// 幾何工具：關節角度、距離、平滑處理
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  // 以 b 為頂點，a-b-c 的夾角（度）
  function angleAt(a, b, c) {
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
    if (!n1 || !n2) return 0;
    let cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // 由 lower 指向 upper 的線段偏離垂直線的角度（度，有正負）
  function tiltFromVertical(lower, upper) {
    return Math.atan2(upper.x - lower.x, lower.y - upper.y) * 180 / Math.PI;
  }

  function median(values) {
    if (!values.length) return NaN;
    const s = values.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // 指數移動平均，降低骨架點抖動
  class LandmarkSmoother {
    constructor(alpha) {
      this.alpha = alpha == null ? 0.5 : alpha;
      this.prev = null;
    }
    reset() { this.prev = null; }
    smooth(points) {
      if (!this.prev || this.prev.length !== points.length) {
        this.prev = points.map(p => ({ x: p.x, y: p.y, visibility: p.visibility }));
        return this.prev;
      }
      const a = this.alpha;
      this.prev = points.map((p, i) => {
        const q = this.prev[i];
        return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, visibility: p.visibility };
      });
      return this.prev;
    }
  }

  RCDD.geo = { angleAt, dist, tiltFromVertical, median, LandmarkSmoother };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.geo;
})(typeof window !== 'undefined' ? window : globalThis);
