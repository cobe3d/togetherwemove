// 動作判斷：由骨架點算出特徵、用狀態機計次、每一下評分
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const geo = RCDD.geo;

  // MediaPipe Pose 的關鍵點編號
  const IDX = {
    nose: 0,
    L: { ear: 7, shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
    R: { ear: 8, shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
  };
  const vis = p => (p && p.visibility != null ? p.visibility : 1);

  // 從 33 個骨架點取出評分要用的數值。側身時選靠近鏡頭（看得最清楚）的那一側。
  class FeatureExtractor {
    constructor() { this.reset(); }
    reset() { this.side = null; this.switchCount = 0; this.facing = 1; }

    sideScore(lm, s) {
      const i = IDX[s];
      return vis(lm[i.shoulder]) + vis(lm[i.elbow]) + vis(lm[i.wrist]) + vis(lm[i.hip]);
    }

    extract(lm) {
      if (!lm || lm.length < 29) return null;
      const sl = this.sideScore(lm, 'L'), sr = this.sideScore(lm, 'R');
      const best = sl >= sr ? 'L' : 'R';
      if (!this.side) {
        this.side = best;
      } else if (best !== this.side && Math.abs(sl - sr) > 0.3) {
        if (++this.switchCount > 8) { this.side = best; this.switchCount = 0; }
      } else {
        this.switchCount = 0;
      }

      const i = IDX[this.side];
      const shoulder = lm[i.shoulder], elbow = lm[i.elbow], wrist = lm[i.wrist], hip = lm[i.hip];
      const ear = lm[i.ear], knee = lm[i.knee], ankle = lm[i.ankle], nose = lm[IDX.nose];
      const visible = Math.min(vis(shoulder), vis(elbow), vis(wrist), vis(hip)) > 0.5;

      // 鼻子在耳朵的哪一邊 = 臉朝哪一邊
      if (vis(nose) > 0.5 && vis(ear) > 0.3) {
        const d = nose.x - ear.x;
        if (Math.abs(d) > 4) this.facing = d > 0 ? 1 : -1;
      }

      const trunkLen = geo.dist(shoulder, hip) || 1;
      return {
        side: this.side,
        visible,
        facing: this.facing,
        shoulderAngle: geo.angleAt(hip, shoulder, elbow),
        elbowAngle: geo.angleAt(shoulder, elbow, wrist),
        trunkTilt: geo.tiltFromVertical(hip, shoulder),
        shrugRatio: geo.dist(ear, shoulder) / trunkLen,
        shoulderSpread: Math.abs(lm[IDX.L.shoulder].x - lm[IDX.R.shoulder].x) / trunkLen,
        trunkLen,
        armLen: geo.dist(shoulder, elbow) + geo.dist(elbow, wrist),
        points: { shoulder, elbow, wrist, hip, ear, knee, ankle, nose }
      };
    }
  }

  // 狀態機：準備 → 抬手中（含到達目標、維持）→ 放下 = 完成 1 次
  class RepTracker {
    constructor(cfg, target) {
      this.cfg = cfg;
      this.target = target || cfg.targetMax;
      this.baseline = { tilt: null, shrug: null };
      this.reset();
    }

    reset() {
      this.state = 'ready';
      this.rep = null;
      this.lastT = null;
      this.lostSince = null;
      this.lostFired = false;
      this.restT = null;
      this.current = { angle: 0, holdProgress: 0, reached: false, picked: false };
    }

    update(f, t) {
      const ev = [];
      const cfg = this.cfg;
      const dt = this.lastT == null ? 0 : Math.max(0, Math.min(t - this.lastT, 0.25));
      this.lastT = t;

      if (!f || !f.visible) {
        if (this.lostSince == null) this.lostSince = t;
        if (!this.lostFired && t - this.lostSince > 1.2) {
          this.lostFired = true;
          ev.push({ type: 'lost' });
        }
        return ev;
      }
      if (this.lostFired) ev.push({ type: 'found' });
      this.lostSince = null;
      this.lostFired = false;

      const a = f.shoulderAngle;
      this.current.angle = a;

      if (this.state === 'ready') {
        if (a < cfg.startBelow) {
          // 手放下時記錄個人的坐姿基準，用來判斷代償
          const b = this.baseline;
          b.tilt = b.tilt == null ? f.trunkTilt : b.tilt + (f.trunkTilt - b.tilt) * 0.1;
          b.shrug = b.shrug == null ? f.shrugRatio : b.shrug + (f.shrugRatio - b.shrug) * 0.1;
        }
        this.current.holdProgress = 0;
        this.current.reached = false;
        this.current.picked = false;
        if (a < cfg.startBelow || this.restT == null) this.restT = t;
        if (a > cfg.activeAbove) {
          this.state = 'active';
          this.rep = {
            // 從手離開放下位置的時間開始算抬手速度
            start: this.restT, max: a, samples: [{ t, a }], high: [], peak: snap(f),
            holdRun: 0, hold: 0, reached: false, picked: false, near: false
          };
          ev.push({ type: 'start' });
        }
        return ev;
      }

      const r = this.rep;
      r.samples.push({ t, a });
      if (a > r.max) { r.max = a; r.peak = snap(f); }
      if (a >= this.target * cfg.highRatio) r.high.push(snap(f));

      if (a >= this.target - cfg.holdTolerance) {
        r.holdRun += dt;
        r.hold = Math.max(r.hold, r.holdRun);
        if (!r.reached) { r.reached = true; ev.push({ type: 'reached' }); }
        if (!r.picked && r.holdRun >= cfg.holdSeconds) { r.picked = true; ev.push({ type: 'picked' }); }
      } else {
        r.holdRun = 0;
        if (!r.near && !r.reached && a >= this.target * cfg.nearRatio) {
          r.near = true;
          ev.push({ type: 'near' });
        }
      }
      this.current.reached = r.reached;
      this.current.picked = r.picked;
      this.current.holdProgress = r.picked ? 1 : Math.min(r.holdRun / cfg.holdSeconds, 1);

      if (a < cfg.startBelow) {
        this.state = 'ready';
        this.rep = null;
        if (r.max < cfg.minRepAngle) {
          ev.push({ type: 'ignored', max: r.max });
        } else {
          const rep = summarizeRep(r, t);
          ev.push({ type: 'rep', rep, score: scoreRep(rep, this.target, cfg, this.baseline) });
        }
      }
      return ev;
    }
  }

  function snap(f) {
    return { elbow: f.elbowAngle, tilt: f.trunkTilt, shrug: f.shrugRatio };
  }

  function summarizeRep(r, endT) {
    const reach = r.samples.find(s => s.a >= r.max * 0.9);
    return {
      max: r.max,
      hold: r.hold,
      riseSec: reach ? reach.t - r.start : endT - r.start,
      durationSec: endT - r.start,
      reached: r.reached,
      picked: r.picked,
      high: r.high.length ? r.high : [r.peak]
    };
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function tempoScore(rise, tempo, weight) {
    if (rise < tempo.min) return weight * clamp01((rise - 0.5) / (tempo.min - 0.5));
    if (rise > tempo.max) return weight * clamp01(1 - (rise - tempo.max) / 4);
    return weight;
  }

  // 每一下的四項分數
  function scoreRep(rep, target, cfg, baseline) {
    const w = cfg.weights;
    const faults = [];
    const high = rep.high;
    for (const c of cfg.checks) {
      if (c.type === 'elbowBent') {
        if (geo.median(high.map(h => h.elbow)) < c.minAngle) faults.push(c);
      } else if (c.type === 'trunkLean') {
        if (baseline && baseline.tilt != null &&
            geo.median(high.map(h => Math.abs(h.tilt - baseline.tilt))) > c.maxDelta) faults.push(c);
      } else if (c.type === 'shrug') {
        if (baseline && baseline.shrug &&
            geo.median(high.map(h => h.shrug / baseline.shrug)) < c.ratio) faults.push(c);
      }
    }
    const range = Math.round(w.range * Math.min(rep.max / target, 1));
    const form = Math.max(0, w.form - faults.reduce((s, c) => s + c.penalty, 0));
    const hold = Math.round(w.hold * Math.min(rep.hold / cfg.holdSeconds, 1));
    const tempo = Math.round(tempoScore(rep.riseSec, cfg.tempo, w.tempo));
    return {
      range, form, hold, tempo,
      total: range + form + hold + tempo,
      faults: faults.map(c => c.type),
      faultVoice: faults.length ? faults[0].voice : null,
      maxAngle: Math.round(rep.max),
      picked: rep.picked
    };
  }

  // 整回合的結果：四項取平均，總分 = 四項平均相加
  function summarizeSession(scores, cfg) {
    const n = scores.length;
    const avg = k => (n ? Math.round(scores.reduce((s, x) => s + x[k], 0) / n) : 0);
    const parts = { range: avg('range'), form: avg('form'), hold: avg('hold'), tempo: avg('tempo') };
    const faultCounts = {};
    for (const c of cfg.checks) faultCounts[c.type] = 0;
    for (const s of scores) for (const f of s.faults) faultCounts[f] = (faultCounts[f] || 0) + 1;
    return {
      reps: n,
      parts,
      total: n ? parts.range + parts.form + parts.hold + parts.tempo : 0,
      maxAngle: n ? Math.max(...scores.map(s => s.maxAngle)) : 0,
      picked: scores.filter(s => s.picked).length,
      faultCounts
    };
  }

  // 個人目標 = 能力測量最大角度 + 5°，介於下限與治療師上限之間
  function computeTarget(maxAngles, cfg) {
    const best = Math.max(...maxAngles);
    return Math.round(Math.max(cfg.minTarget, Math.min(best + cfg.targetBonus, cfg.targetMax)));
  }

  function starsFor(total) {
    if (total >= 85) return 3;
    if (total >= 70) return 2;
    return 1;
  }

  RCDD.exercise = { IDX, FeatureExtractor, RepTracker, scoreRep, summarizeSession, computeTarget, starsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercise;
})(typeof window !== 'undefined' ? window : globalThis);
