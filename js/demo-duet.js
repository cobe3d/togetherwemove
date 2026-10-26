// 雙手聯彈示範模式：兩手張開、掌心朝前，左右手輪流彎下指定的手指
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const APPROACH = 0.45, HOLD = 0.3, RELEASE = 0.45, PAUSE = 0.2;
  const STEP = APPROACH + HOLD + RELEASE + PAUSE;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const CHAIN = { I: [5, 6, 7, 8], M: [9, 10, 11, 12], R: [13, 14, 15, 16], P: [17, 18, 19, 20] };
  const NEIGHBOR = { T: ['I'], I: ['M'], M: ['I', 'R'], R: ['M', 'P'], P: ['R'] };

  // 右手、掌心朝向鏡頭（鏡像畫面：拇指在左邊、朝中間）
  const BASE = [
    { x: 640, y: 500 },
    { x: 590, y: 470 }, { x: 555, y: 430 }, { x: 530, y: 390 }, { x: 510, y: 355 },
    { x: 600, y: 360 }, { x: 595, y: 300 }, { x: 592, y: 262 }, { x: 590, y: 230 },
    { x: 640, y: 355 }, { x: 640, y: 290 }, { x: 640, y: 248 }, { x: 640, y: 212 },
    { x: 680, y: 360 }, { x: 684, y: 300 }, { x: 687, y: 262 }, { x: 690, y: 232 },
    { x: 715, y: 375 }, { x: 722, y: 330 }, { x: 727, y: 300 }, { x: 730, y: 275 }
  ];
  const SHIFT = 190;

  class DemoDuetPose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.roundOffset = 0;
      this.sequence = ['T', 'I', 'M', 'R', 'P', 'R', 'M', 'I', 'T'];
      this.wrongRounds = new Set([2]);     // 這一回先彎錯一隻手指
      this.sloppyRounds = new Set([3]);    // 這一回旁邊的手指都跟著彎
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }
    start(nowMs, roundOffset) { this.active = true; this.t0 = nowMs; if (roundOffset != null) this.roundOffset = roundOffset; }
    idle() { this.active = false; }

    plan(r) {
      const out = [];
      for (const f of this.sequence) { out.push({ hand: 'L', f }); out.push({ hand: 'R', f }); }
      if (this.wrongRounds.has(r)) out.splice(4, 0, { hand: 'L', f: 'R' });
      if (this.sloppyRounds.has(r)) out.forEach(s => { s.sloppy = true; });
      return out;
    }

    pose(nowMs) {
      if (!this.active) return null;
      let t = Math.max(0, (nowMs - this.t0) / 1000);
      let r = this.roundOffset;
      for (;;) {
        const steps = this.plan(r);
        const len = steps.length * STEP + 0.6;
        if (t < len) {
          const k = Math.floor(t / STEP);
          if (k >= steps.length) return null;
          const u = t - k * STEP;
          let p;
          if (u < APPROACH) p = ease(u / APPROACH);
          else if (u < APPROACH + HOLD) p = 1;
          else if (u < APPROACH + HOLD + RELEASE) p = 1 - ease((u - APPROACH - HOLD) / RELEASE);
          else p = 0;
          return Object.assign({ p }, steps[k]);
        }
        t -= len;
        r++;
      }
    }

    read(nowMs) {
      return buildDuetLandmarks(this.pose(nowMs), this.noise);
    }
  }

  // 一隻手的某隻手指彎下 p（0～1）
  function bendFinger(pts, f, p) {
    if (p <= 0) return;
    if (f === 'T') {
      const target = { x: (BASE[13].x + BASE[17].x) / 2, y: (BASE[13].y + BASE[17].y) / 2 + 10 };
      pts[4] = lerp(BASE[4], target, p);
      pts[3] = lerp(BASE[3], lerp(BASE[2], BASE[9], 0.5), p * 0.7);
      return;
    }
    const [m, pip, dip, tip] = CHAIN[f];
    const palmC = { x: (BASE[0].x + BASE[9].x) / 2, y: (BASE[0].y + BASE[9].y) / 2 };
    const curled = lerp(BASE[m], palmC, 0.35);
    pts[tip] = lerp(BASE[tip], curled, p);
    pts[dip] = lerp(BASE[dip], lerp(BASE[pip], curled, 0.5), p);
    pts[pip] = lerp(BASE[pip], lerp(BASE[m], BASE[pip], 0.75), p);
  }

  function buildDuetLandmarks(o, noisy) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.2 : 0);
    const hands = { L: BASE.map(q => ({ x: q.x, y: q.y })), R: BASE.map(q => ({ x: q.x, y: q.y })) };
    if (o && o.p > 0) {
      const pts = hands[o.hand];
      if (o.sloppy) for (const nb of NEIGHBOR[o.f]) bendFinger(pts, nb, o.p * 0.85);
      else if (o.f === 'R') bendFinger(pts, 'P', o.p * 0.25);   // 彎無名指時，小指自然會跟著動一點
      bendFinger(pts, o.f, o.p);
    }
    const toScreen = (q, side) => ({
      x: (side === 'R' ? q.x + SHIFT : 2 * 640 - q.x - SHIFT) + n(),
      y: q.y + n(),
      visibility: 1
    });
    return hands.L.map(q => toScreen(q, 'L')).concat(hands.R.map(q => toScreen(q, 'R')));
  }

  RCDD.DemoDuetPose = DemoDuetPose;
  RCDD.buildDuetLandmarks = buildDuetLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoDuetPose, buildDuetLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
