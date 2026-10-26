// 彈鋼琴示範模式：一隻手掌對著鏡頭、拇指依序碰各手指的虛擬手
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const APPROACH = 0.55, HOLD = 0.3, RELEASE = 0.5, PAUSE = 0.25;
  const STEP = APPROACH + HOLD + RELEASE + PAUSE;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const TIP = { I: 8, M: 12, R: 16, P: 20 };
  const CHAIN = { I: [5, 6, 7, 8], M: [9, 10, 11, 12], R: [13, 14, 15, 16], P: [17, 18, 19, 20] };

  // 右手、掌心對著鏡頭（畫面已左右翻轉：拇指在左邊）
  const BASE = [
    { x: 640, y: 500 },
    { x: 590, y: 470 }, { x: 555, y: 430 }, { x: 530, y: 390 }, { x: 510, y: 355 },
    { x: 600, y: 360 }, { x: 595, y: 300 }, { x: 592, y: 262 }, { x: 590, y: 230 },
    { x: 640, y: 355 }, { x: 640, y: 290 }, { x: 640, y: 248 }, { x: 640, y: 212 },
    { x: 680, y: 360 }, { x: 684, y: 300 }, { x: 687, y: 262 }, { x: 690, y: 232 },
    { x: 715, y: 375 }, { x: 722, y: 330 }, { x: 727, y: 300 }, { x: 730, y: 275 }
  ];

  class DemoHandPose {
    constructor() {
      this.isDemo = true;
      this.width = 1280;
      this.height = 720;
      this.active = false;
      this.t0 = 0;
      this.roundOffset = 0;
      this.prefer = 'R';
      this.sequence = ['I', 'M', 'R', 'P'];
      this.calibRounds = 2;
      this.wrongRounds = new Set([4]);     // 這一回先碰錯手指
      this.lazyRounds = new Set([8]);      // 這一回手指沒有張開
      this.noise = true;
    }
    async load() {}
    async startCamera() {}
    stopCamera() {}
    brightness() { return 120; }
    start(nowMs, roundOffset) { this.active = true; this.t0 = nowMs; if (roundOffset != null) this.roundOffset = roundOffset; }
    idle() { this.active = false; }

    // 第 r 回要碰的手指（能力測量固定單向）
    plan(r) {
      const seq = r < this.calibRounds ? ['I', 'M', 'R', 'P'] : this.sequence;
      if (!this.wrongRounds.has(r)) return seq.map(f => ({ f }));
      const out = seq.map(f => ({ f }));
      out.splice(1, 0, { f: seq[2] === seq[1] ? 'P' : seq[2] });
      return out;
    }

    pose(nowMs) {
      if (!this.active) return { finger: null, p: 0 };
      let t = Math.max(0, (nowMs - this.t0) / 1000);
      let r = this.roundOffset;
      // 每回之間多停 0.6 秒
      for (;;) {
        const steps = this.plan(r);
        const len = steps.length * STEP + 0.6;
        if (t < len) {
          const k = Math.floor(t / STEP);
          if (k >= steps.length) return { finger: null, p: 0 };
          const u = t - k * STEP;
          // 偷懶的一回：拇指不張開，直接從這隻手指滑到下一隻
          const lazy = this.lazyRounds.has(r);
          const slideIn = lazy && k > 0;
          const slideOut = lazy && k < steps.length - 1;
          if (slideIn && u < APPROACH) return { finger: steps[k].f, p: 1 };
          if (slideOut && u >= APPROACH + HOLD) {
            return { finger: steps[k + 1].f, p: 1, slide: { from: steps[k].f, u: ease((u - APPROACH - HOLD) / (RELEASE + PAUSE)) } };
          }
          let p;
          if (u < APPROACH) p = ease(u / APPROACH);
          else if (u < APPROACH + HOLD) p = 1;
          else if (u < APPROACH + HOLD + RELEASE) p = 1 - ease((u - APPROACH - HOLD) / RELEASE);
          else p = 0;
          return { finger: steps[k].f, p };
        }
        t -= len;
        r++;
      }
    }

    read(nowMs) {
      const { finger, p, slide } = this.pose(nowMs);
      return buildHandLandmarks(finger, p, this.prefer, this.noise, slide);
    }
  }

  const meetOf = f => {
    const tip = BASE[TIP[f]], thumb = BASE[4];
    return { x: tip.x + (thumb.x - tip.x) * 0.45, y: tip.y + (thumb.y - tip.y) * 0.45 + 25 };
  };

  // 手指彎向會合點
  function bend(pts, f, p) {
    const chain = CHAIN[f], meet = meetOf(f);
    pts[chain[3]] = lerp(BASE[TIP[f]], meet, p);
    pts[chain[2]] = lerp(BASE[chain[2]], lerp(BASE[chain[1]], meet, 0.55), p * 0.8);
    pts[chain[1]] = lerp(BASE[chain[1]], lerp(BASE[chain[0]], meet, 0.3), p * 0.5);
  }

  // slide：拇指從 slide.from 那隻手指滑到 finger（不張開）
  function buildHandLandmarks(finger, p, hand, noisy, slide) {
    const n = () => (noisy ? (Math.random() - 0.5) * 1.2 : 0);
    const pts = BASE.map(q => ({ x: q.x, y: q.y }));
    if (finger && p > 0) {
      let meet = meetOf(finger), tp = p;
      if (slide) {
        bend(pts, slide.from, 1 - slide.u * 0.3);
        meet = lerp(meetOf(slide.from), meetOf(finger), slide.u);
        tp = 1;
        bend(pts, finger, slide.u);
      } else {
        bend(pts, finger, p);
      }
      // 拇指伸向手指
      pts[4] = lerp(BASE[4], { x: meet.x - 6, y: meet.y + 4 }, tp);
      pts[3] = lerp(BASE[3], lerp(BASE[2], meet, 0.55), tp);
      pts[2] = lerp(BASE[2], lerp(BASE[1], meet, 0.25), tp * 0.6);
    }
    // 左手 = 右手的鏡像
    const cx = 640;
    return pts.map(q => ({ x: (hand === 'L' ? 2 * cx - q.x : q.x) + n(), y: q.y + n(), visibility: 1 }));
  }

  RCDD.DemoHandPose = DemoHandPose;
  RCDD.buildHandLandmarks = buildHandLandmarks;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DemoHandPose, buildHandLandmarks };
})(typeof window !== 'undefined' ? window : globalThis);
