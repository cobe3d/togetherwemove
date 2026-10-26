// 執行：node --test tests
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/shoulder-flexion.js');
const ex = require('../js/exercise.js');
const { DemoPose, buildLandmarks } = require('../js/demo-pose.js');

const FPS = 30;

// 依角度曲線產生特徵序列，丟進狀態機，回傳所有事件
function run(tracker, segments, extra = {}) {
  const events = [];
  let t = 0;
  for (const seg of segments) {
    const frames = Math.round(seg.sec * FPS);
    for (let i = 0; i < frames; i++) {
      const u = frames > 1 ? i / (frames - 1) : 1;
      const a = seg.from + (seg.to - seg.from) * u;
      const f = Object.assign(
        { visible: true, shoulderAngle: a, elbowAngle: 172, trunkTilt: 0, shrugRatio: 0.45 },
        extra,
        seg.feat ? seg.feat(u, a) : {},
        seg.hidden ? { visible: false } : {}
      );
      for (const e of tracker.update(f, t)) events.push(e);
      t += 1 / FPS;
    }
  }
  return events;
}

const cleanRep = peak => [
  { sec: 0.6, from: 20, to: 20 },
  { sec: 2.0, from: 20, to: peak },
  { sec: 2.5, from: peak, to: peak },
  { sec: 1.2, from: peak, to: 20 },
  { sec: 0.4, from: 20, to: 20 }
];

test('angleAt 算出直角與一直線', () => {
  assert.equal(Math.round(geo.angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 90);
  assert.equal(Math.round(geo.angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 })), 180);
});

test('標準的一下：到達目標並撐住，滿分 100', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, cleanRep(150));
  const types = ev.map(e => e.type);
  assert.deepEqual(types, ['start', 'near', 'reached', 'picked', 'rep']);
  const s = ev.find(e => e.type === 'rep').score;
  assert.deepEqual([s.range, s.form, s.hold, s.tempo, s.total], [40, 30, 20, 10, 100]);
  assert.equal(s.picked, true);
});

test('沒到目標：仍計 1 次，幅度分依比例、維持分 0', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, cleanRep(120));
  const rep = ev.filter(e => e.type === 'rep');
  assert.equal(rep.length, 1);
  assert.equal(ev.some(e => e.type === 'picked'), false);
  assert.equal(rep[0].score.range, Math.round(40 * 120 / 146));
  assert.equal(rep[0].score.hold, 0);
});

test('太小的動作不計次', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, cleanRep(55));
  assert.equal(ev.filter(e => e.type === 'rep').length, 0);
  assert.equal(ev.filter(e => e.type === 'ignored').length, 1);
});

test('連續兩下分別計次', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, [...cleanRep(150), ...cleanRep(148)]);
  assert.equal(ev.filter(e => e.type === 'rep').length, 2);
});

test('手肘彎曲扣 10 分並給語音提醒', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, cleanRep(150), {});
  const tr2 = new ex.RepTracker(cfg, 146);
  const ev2 = run(tr2, cleanRep(150).map(s => Object.assign({}, s, { feat: () => ({ elbowAngle: 140 }) })));
  const s = ev2.find(e => e.type === 'rep').score;
  assert.equal(ev.find(e => e.type === 'rep').score.form, 30);
  assert.equal(s.form, 20);
  assert.deepEqual(s.faults, ['elbowBent']);
  assert.equal(s.faultVoice, '手肘再伸直一點');
});

test('身體後仰超過 15° 扣分（與準備時的坐姿比較）', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const lean = [null, u => -22 * u, () => -22, u => -22 * (1 - u)];
  const segs = cleanRep(150).map((s, i) => Object.assign({}, s, lean[i] ? { feat: u => ({ trunkTilt: lean[i](u) }) } : {}));
  const s = run(tr, segs).find(e => e.type === 'rep').score;
  assert.deepEqual(s.faults, ['trunkLean']);
});

test('太快甩上去，節奏分降低', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, [
    { sec: 0.6, from: 20, to: 20 },
    { sec: 0.5, from: 20, to: 150 },
    { sec: 2.5, from: 150, to: 150 },
    { sec: 1.0, from: 150, to: 20 }
  ]);
  const s = ev.find(e => e.type === 'rep').score;
  assert.ok(s.tempo < 10, `tempo=${s.tempo}`);
});

test('看不到手臂超過 1.2 秒才提示一次', () => {
  const tr = new ex.RepTracker(cfg, 146);
  const ev = run(tr, [{ sec: 0.5, from: 20, to: 20 }, { sec: 3, from: 20, to: 20, hidden: true }, { sec: 0.2, from: 20, to: 20 }]);
  assert.deepEqual(ev.map(e => e.type), ['lost', 'found']);
});

test('個人目標：最大值 +5°，介於 70° 與 150° 之間', () => {
  assert.equal(ex.computeTarget([134, 140, 141], cfg), 146);
  assert.equal(ex.computeTarget([170], cfg), 150);
  assert.equal(ex.computeTarget([50], cfg), 70);
});

test('整回合總分 = 四項平均相加', () => {
  const scores = [
    { range: 40, form: 30, hold: 20, tempo: 10, total: 100, faults: [], maxAngle: 150, picked: true },
    { range: 32, form: 20, hold: 10, tempo: 6, total: 68, faults: ['elbowBent'], maxAngle: 120, picked: false }
  ];
  const sum = ex.summarizeSession(scores, cfg);
  assert.deepEqual(sum.parts, { range: 36, form: 25, hold: 15, tempo: 8 });
  assert.equal(sum.total, 84);
  assert.equal(sum.maxAngle, 150);
  assert.equal(sum.picked, 1);
  assert.equal(sum.faultCounts.elbowBent, 1);
});

test('示範骨架：選到靠近鏡頭的一側，角度與設定一致', () => {
  const fx = new ex.FeatureExtractor();
  const f = fx.extract(buildLandmarks(120, 8, 0, false));
  assert.equal(f.side, 'L');
  assert.equal(f.facing, 1);
  assert.equal(f.visible, true);
  assert.equal(Math.round(f.shoulderAngle), 120);
  assert.equal(Math.round(f.elbowAngle), 172);
  assert.ok(f.shoulderSpread < 0.55);
});

test('示範模式完整跑 3 下測量 + 10 下遊戲', () => {
  const demo = new DemoPose();
  demo.noise = false;
  const fx = new ex.FeatureExtractor();
  const smoother = new geo.LandmarkSmoother(0.5);

  const play = (tracker, offset, reps) => {
    demo.start(0, offset);
    const out = [];
    for (let ms = 0; out.length < reps && ms < 200000; ms += 1000 / FPS) {
      const f = fx.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return out;
  };

  const calib = play(new ex.RepTracker(cfg, cfg.targetMax), 0, 3);
  const target = ex.computeTarget(calib.map(e => e.rep.max), cfg);
  assert.ok(target >= 144 && target <= 147, `target=${target}`);

  const game = play(new ex.RepTracker(cfg, target), 3, 10);
  assert.equal(game.length, 10);
  const scores = game.map(e => e.score);
  assert.deepEqual(scores.map(s => s.picked), [false, true, true, true, false, true, true, true, true, true]);
  assert.deepEqual(scores[3].faults, ['elbowBent']);
  assert.deepEqual(scores[6].faults, ['trunkLean']);
  const sum = ex.summarizeSession(scores, cfg);
  assert.ok(sum.total >= 80 && sum.total <= 95, `total=${sum.total}`);
});
