// 執行：node --test tests/drum.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/cross-tap.js');
const D = require('../js/drum.js');
const { DemoDrumPose, buildDrumLandmarks } = require('../js/demo-drum.js');

const FPS = 30;
const fx = new D.DrumFeatureExtractor(cfg);
const feat = o => fx.extract(buildDrumLandmarks(o, false));

// 依序播放一段段姿勢，回傳事件
function run(tracker, segments) {
  const events = [];
  let t = 0;
  for (const seg of segments) {
    const frames = Math.round(seg.sec * FPS);
    for (let i = 0; i < frames; i++) {
      const u = frames > 1 ? i / (frames - 1) : 1;
      const p = seg.from + (seg.to - seg.from) * u;
      const f = seg.hidden ? null : feat(Object.assign({}, seg.opts, { p }));
      for (const e of tracker.update(f, t)) events.push(e);
      t += 1 / FPS;
    }
  }
  return events;
}

const tap = (hand, opts = {}) => [
  { sec: 0.5, from: 0, to: 0, opts: { hand } },
  { sec: 0.9, from: 0, to: 1, opts: Object.assign({ hand }, opts) },
  { sec: 0.4, from: 1, to: 1, opts: Object.assign({ hand }, opts) },
  { sec: 0.9, from: 1, to: 0, opts: Object.assign({ hand }, opts) },
  { sec: 0.3, from: 0, to: 0, opts: { hand } }
];

test('正面骨架：手放下、拍肩時距離與越過中線', () => {
  const rest = feat({ hand: 'R', p: 0 });
  assert.equal(rest.visible, true);
  assert.equal(rest.frontal, true);
  assert.equal(rest.hands.R.rest, true);
  assert.equal(rest.hands.L.rest, true);
  const up = feat({ hand: 'R', p: 1 });
  assert.equal(up.hands.R.rest, false);
  assert.equal(up.hands.R.crossed, true);
  assert.ok(up.hands.R.d < 0.2, 'd=' + up.hands.R.d);
});

test('右手拍左肩：拍到並放下算 1 下，滿分', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3 });
  const ev = run(tr, tap('R'));
  assert.deepEqual(ev.map(e => e.type), ['cue', 'hit', 'rep', 'cue']);
  const s = ev.find(e => e.type === 'rep').score;
  assert.deepEqual([s.reach, s.form, s.timing, s.alternate, s.total], [40, 30, 20, 10, 100]);
  assert.equal(ev.find(e => e.type === 'rep').next, 'L');
});

test('左右交替：拍完右手換左手', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3 });
  const ev = run(tr, [...tap('R'), ...tap('L')]);
  assert.equal(ev.filter(e => e.type === 'rep').length, 2);
  assert.deepEqual(ev.filter(e => e.type === 'hit').map(e => e.hand), ['R', 'L']);
});

test('用錯手不計次，並扣交替分', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3 });
  const ev = run(tr, [...tap('L'), ...tap('R')]);
  assert.equal(ev.filter(e => e.type === 'wrong').length, 1);
  const reps = ev.filter(e => e.type === 'rep');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].rep.hand, 'R');
  assert.equal(reps[0].score.alternate, 5);
});

test('差一點沒拍到：仍算 1 下但分數較低；太遠就再試一次', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3 });
  const ev = run(tr, tap('R', { short: true }));
  const rep = ev.find(e => e.type === 'rep');
  assert.ok(rep, '應該要計次');
  assert.equal(rep.score.hit, false);
  assert.ok(rep.score.reach < 40 && rep.score.reach >= 12, 'reach=' + rep.score.reach);

  const tr2 = new D.TapTracker(cfg, { touch: 0.3 });
  const ev2 = run(tr2, [
    { sec: 0.5, from: 0, to: 0, opts: { hand: 'R' } },
    { sec: 0.8, from: 0, to: 0.45, opts: { hand: 'R' } },
    { sec: 0.8, from: 0.45, to: 0, opts: { hand: 'R' } }
  ]);
  assert.deepEqual(ev2.map(e => e.type), ['cue', 'miss']);
});

test('低頭去碰、身體歪斜會扣姿勢分', () => {
  const s1 = run(new D.TapTracker(cfg, { touch: 0.3 }), tap('R', { headDrop: true })).find(e => e.type === 'rep').score;
  assert.deepEqual(s1.faults, ['headDrop']);
  assert.equal(s1.form, 20);
  const s2 = run(new D.TapTracker(cfg, { touch: 0.3 }), tap('R', { tilt: true })).find(e => e.type === 'rep').score;
  assert.deepEqual(s2.faults, ['trunkTilt']);
});

test('反應太慢，節拍分降低', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3, interval: 3 });
  const ev = run(tr, [{ sec: 6, from: 0, to: 0, opts: { hand: 'R' } }, ...tap('R')]);
  const s = ev.find(e => e.type === 'rep').score;
  assert.ok(s.timing < 20 && s.timing > 0, 'timing=' + s.timing);
});

test('節拍速度跟著長輩調整', () => {
  assert.equal(D.adaptInterval(3, [1, 1.2, 1.1], cfg), 2.7);
  assert.equal(D.adaptInterval(3, [5, 4.8, 5.2], cfg), 3.3);
  assert.equal(D.adaptInterval(3, [2.5, 3, 3.2], cfg), 3);
  assert.equal(D.adaptInterval(2, [0.5, 0.5, 0.5], cfg), 2);
});

test('個人判定距離：0.3～0.8 倍肩寬', () => {
  assert.equal(D.computeTouch([0.1, 0.12, 0.15, 0.11], cfg), 0.3);
  assert.equal(D.computeTouch([0.4, 0.5], cfg), 0.63);
  assert.equal(D.computeTouch([0.9, 0.8], cfg), 0.8);
});

test('看不到人超過 1.2 秒才提示', () => {
  const tr = new D.TapTracker(cfg, { touch: 0.3 });
  const ev = run(tr, [{ sec: 0.3, from: 0, to: 0, opts: { hand: 'R' } }, { sec: 2, from: 0, to: 0, hidden: true }, { sec: 0.2, from: 0, to: 0, opts: { hand: 'R' } }]);
  assert.deepEqual(ev.map(e => e.type), ['cue', 'lost', 'found']);
});

test('示範模式完整跑 4 下測量 + 12 下遊戲', () => {
  const demo = new DemoDrumPose();
  demo.noise = false;
  const smoother = new geo.LandmarkSmoother(0.5);
  const play = (tracker, offset, reps) => {
    demo.start(0, offset);
    const out = [];
    for (let ms = 0; out.length < reps && ms < 120000; ms += 1000 / FPS) {
      const f = fx.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return out;
  };
  const calib = play(new D.TapTracker(cfg, { calibrating: true }), 0, 4);
  assert.equal(calib.length, 4);
  const touch = D.computeTouch(calib.map(e => e.rep.minD), cfg);
  assert.equal(touch, 0.3);

  const game = play(new D.TapTracker(cfg, { touch }), 4, 12);
  assert.equal(game.length, 12);
  const scores = game.map(e => e.score);
  assert.deepEqual(scores.map(s => s.hit), [true, true, true, true, true, true, true, false, true, true, true, true]);
  assert.deepEqual(scores[5].faults, ['headDrop']);
  assert.deepEqual(scores[9].faults, ['trunkTilt']);
  const sum = D.summarizeDrum(scores, cfg);
  assert.equal(sum.hits, 11);
  assert.equal(sum.maxCombo, 7);
  assert.ok(sum.total >= 85 && sum.total <= 98, 'total=' + sum.total);
});
