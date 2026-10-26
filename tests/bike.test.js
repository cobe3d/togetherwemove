// 執行：node --test tests/bike.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/knee-lift.js');
const B = require('../js/bike.js');
const { DemoBikePose, buildBikeLandmarks } = require('../js/demo-bike.js');

const FPS = 30;
const fx = new B.BikeFeatureExtractor();
const feat = o => fx.extract(buildBikeLandmarks(o, false));

function run(tracker, segments) {
  const events = [];
  let t = 0;
  for (const seg of segments) {
    const frames = Math.round(seg.sec * FPS);
    for (let i = 0; i < frames; i++) {
      const u = frames > 1 ? i / (frames - 1) : 1;
      const lift = seg.from + (seg.to - seg.from) * u;
      const f = seg.hidden ? null : feat(Object.assign({ leg: seg.leg, lift }, seg.opts));
      for (const e of tracker.update(f, t)) events.push(e);
      t += 1 / FPS;
    }
  }
  return events;
}
// 抬起來就放下；opts（後仰、歪斜）只套用在抬到最高的那段
const kick = (leg, peak, opts, top = 0.4) => [
  { sec: 0.6, leg, from: 0, to: 0 },
  { sec: 0.9, leg, from: 0, to: peak },
  { sec: top, leg, from: peak, to: peak, opts },
  { sec: 0.9, leg, from: peak, to: 0 },
  { sec: 0.3, leg, from: 0, to: 0 }
];

test('正面腿部特徵：抬膝時該腳的膝蓋高度上升，另一腳不變', () => {
  const rest = feat({ leg: 'R', lift: 0 });
  assert.equal(rest.visible, true);
  assert.equal(rest.frontal, true);
  const up = feat({ leg: 'R', lift: 0.6 });
  assert.ok(Math.abs(up.legs.R.rel - rest.legs.R.rel - 0.6) < 0.01);
  assert.ok(Math.abs(up.legs.L.rel - rest.legs.L.rel) < 0.01);
});

test('右腳抬到目標再放下：滿分，接著換左腳', () => {
  const tr = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
  const ev = run(tr, kick('R', 0.68));
  assert.deepEqual(ev.map(e => e.type), ['cue', 'start', 'near', 'reached', 'rep', 'cue']);
  const s = ev.find(e => e.type === 'rep').score;
  assert.deepEqual([s.range, s.form, s.tempo, s.total], [50, 30, 20, 100]);
  assert.equal(ev[ev.length - 1].leg, 'L');
});

test('左右交替：兩下分別是右腳、左腳', () => {
  const tr = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
  const ev = run(tr, [...kick('R', 0.68), ...kick('L', 0.7)]);
  assert.deepEqual(ev.filter(e => e.type === 'rep').map(e => e.rep.leg), ['R', 'L']);
});

test('抬錯腳：提醒，不計次', () => {
  const tr = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
  const ev = run(tr, [...kick('L', 0.6), ...kick('R', 0.68)]);
  assert.equal(ev.filter(e => e.type === 'wrong').length, 1);
  assert.deepEqual(ev.filter(e => e.type === 'rep').map(e => e.rep.leg), ['R']);
});

test('抬不夠高：仍計 1 下，幅度分依比例', () => {
  const tr = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
  const s = run(tr, kick('R', 0.39)).find(e => e.type === 'rep').score;
  assert.equal(s.range, Math.round(50 * 0.39 / 0.65));
  assert.equal(s.reached, false);
});

test('太小的動作不計次', () => {
  const tr = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
  const ev = run(tr, kick('R', 0.15));
  assert.equal(ev.filter(e => e.type === 'rep').length, 0);
});

test('身體後仰、身體歪斜會扣姿勢分', () => {
  const s1 = run(new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } }), kick('R', 0.68, { lean: 1 }, 1.2)).find(e => e.type === 'rep').score;
  assert.deepEqual(s1.faults, ['trunkLean']);
  const s2 = run(new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } }), kick('R', 0.68, { tilt: 1 }, 1.2)).find(e => e.type === 'rep').score;
  assert.deepEqual(s2.faults, ['trunkTilt']);
});

test('個人目標：左右腳分開，最高 +0.05，介於 0.25～1.2', () => {
  const t = B.computeTargets([{ leg: 'R', max: 0.6 }, { leg: 'L', max: 0.63 }, { leg: 'R', max: 0.58 }, { leg: 'L', max: 0.1 }], cfg);
  assert.deepEqual(t, { L: 0.68, R: 0.65 });
  assert.deepEqual(B.computeTargets([{ leg: 'R', max: 0.1 }, { leg: 'L', max: 1.4 }], cfg), { L: 1.2, R: 0.25 });
});

test('示範模式：4 下測量 + 10 下遊戲，經過 6 站', () => {
  const demo = new DemoBikePose();
  demo.noise = false;
  const smoother = new geo.LandmarkSmoother(0.5);
  const ex = new B.BikeFeatureExtractor();
  const play = (tracker, offset, reps) => {
    demo.start(0, offset);
    const out = [];
    for (let ms = 0; out.length < reps && ms < 300000; ms += 1000 / FPS) {
      const f = ex.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return { out, tracker };
  };
  const calib = play(new B.LegTracker(cfg, { calibrating: true }), 0, 4);
  assert.deepEqual(calib.out.map(e => e.rep.leg), ['R', 'L', 'R', 'L']);
  const targets = B.computeTargets(calib.out.map(e => ({ leg: e.rep.leg, max: e.rep.max })), cfg);
  assert.ok(Math.abs(targets.R - 0.65) <= 0.02 && Math.abs(targets.L - 0.68) <= 0.02, JSON.stringify(targets));

  const game = play(new B.LegTracker(cfg, { targets, baseline: calib.tracker.baseline }), 4, 10).out;
  assert.equal(game.length, 10);
  const scores = game.map(e => e.score);
  assert.equal(scores[4].reached, false);
  assert.deepEqual(scores[5].faults, ['trunkLean']);
  assert.deepEqual(scores[7].faults, ['trunkTilt']);
  const sum = B.summarizeBike(scores, cfg);
  assert.deepEqual(sum.stops, ['墾丁', '花蓮太魯閣', '台北101', '日月潭', '阿里山', '高雄']);
  assert.ok(sum.left && sum.right);
  assert.ok(sum.total >= 85 && sum.total <= 99, 'total=' + sum.total);
});
