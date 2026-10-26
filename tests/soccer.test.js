// 執行：node --test tests/soccer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/front-kick.js');
const K = require('../js/soccer.js');
const { DemoSoccerPose, buildSoccerLandmarks } = require('../js/demo-soccer.js');

const FPS = 30;
const fx = new K.SoccerFeatureExtractor();
const feat = o => fx.extract(buildSoccerLandmarks(o, false));
const T = { L: 0.6, R: 0.6 };

function run(tracker, segments) {
  const events = [];
  let t = 0;
  for (const seg of segments) {
    const frames = Math.round(seg.sec * FPS);
    for (let i = 0; i < frames; i++) {
      const u = frames > 1 ? i / (frames - 1) : 1;
      const kick = seg.from + (seg.to - seg.from) * u;
      const f = feat(Object.assign({ leg: seg.leg, kick }, seg.opts));
      for (const e of tracker.update(f, t)) events.push(e);
      t += 1 / FPS;
    }
  }
  return events;
}
// 踢出去 → 停一下 → 收回；opts（後仰、彎膝）套用在整個踢腿過程
const kick = (leg, peak, opts, up = 0.6) => [
  { sec: 0.6, leg, from: 0, to: 0 },
  { sec: up, leg, from: 0, to: peak, opts },
  { sec: 0.3, leg, from: peak, to: peak, opts },
  { sec: 0.7, leg, from: peak, to: 0, opts },
  { sec: 0.3, leg, from: 0, to: 0 }
];
const repScore = ev => ev.find(e => e.type === 'rep').score;

test('正面腿部特徵：往前踢時該腳的腳踝往上抬，膝蓋只抬一半；另一腳不變', () => {
  const tr = new K.SoccerTracker(cfg, { targets: T });
  const rest = feat({ leg: 'R', kick: 0 });
  assert.equal(rest.visible, true);
  assert.equal(rest.frontal, true);
  tr.update(rest, 0);
  const up = feat({ leg: 'R', kick: 0.6 });
  assert.ok(Math.abs(tr.kick(up, 'R') - 0.6) < 0.01);
  assert.ok(Math.abs(tr.kick(up, 'L')) < 0.01);
  assert.ok(tr.knee(up, 'R') / tr.kick(up, 'R') < 0.6);
});

test('右腳踢到目標再收回：射門、滿分，接著換左腳', () => {
  const tr = new K.SoccerTracker(cfg, { targets: T });
  const ev = run(tr, kick('R', 0.65));
  assert.deepEqual(ev.map(e => e.type), ['cue', 'start', 'near', 'reached', 'rep', 'cue']);
  const s = repScore(ev);
  assert.deepEqual([s.range, s.form, s.tempo, s.total], [50, 30, 20, 100]);
  assert.equal(s.reached, true);
  assert.equal(ev[ev.length - 1].leg, 'L');
});

test('左右交替：兩下分別是右腳、左腳', () => {
  const tr = new K.SoccerTracker(cfg, { targets: T });
  const ev = run(tr, [...kick('R', 0.65), ...kick('L', 0.66)]);
  assert.deepEqual(ev.filter(e => e.type === 'rep').map(e => e.rep.leg), ['R', 'L']);
});

test('踢錯腳：提醒，不計次', () => {
  const tr = new K.SoccerTracker(cfg, { targets: T });
  const ev = run(tr, [...kick('L', 0.6), ...kick('R', 0.65)]);
  assert.equal(ev.filter(e => e.type === 'wrong').length, 1);
  assert.deepEqual(ev.filter(e => e.type === 'rep').map(e => e.rep.leg), ['R']);
});

test('踢不夠高：仍計 1 下（沒進球），幅度分依比例；太小的動作不計次', () => {
  const s = repScore(run(new K.SoccerTracker(cfg, { targets: T }), kick('R', 0.3)));
  assert.equal(s.range, Math.round(50 * 0.3 / 0.6));
  assert.equal(s.reached, false);
  const ev = run(new K.SoccerTracker(cfg, { targets: T }), kick('R', 0.18));
  assert.equal(ev.filter(e => e.type === 'rep').length, 0);
});

test('身體後仰、彎著膝蓋抬腿會扣姿勢分', () => {
  const s1 = repScore(run(new K.SoccerTracker(cfg, { targets: T }), kick('R', 0.65, { lean: 1 })));
  assert.deepEqual(s1.faults, ['trunkLean']);
  const s2 = repScore(run(new K.SoccerTracker(cfg, { targets: T }), kick('R', 0.65, { bent: true })));
  assert.deepEqual(s2.faults, ['bentKnee']);
  assert.equal(s2.form, 20);
  assert.match(s2.faultVoice, /伸直/);
});

test('踢得太急（一下不到 0.6 秒）：節奏分降低', () => {
  const s = repScore(run(new K.SoccerTracker(cfg, { targets: T }), [
    { sec: 0.6, leg: 'R', from: 0, to: 0 },
    { sec: 0.15, leg: 'R', from: 0, to: 0.65 },
    { sec: 0.15, leg: 'R', from: 0.65, to: 0 },
    { sec: 0.3, leg: 'R', from: 0, to: 0 }
  ]));
  assert.ok(s.tempo < 20, 'tempo=' + s.tempo);
});

test('個人目標：左右腳分開，最高 +0.05，介於 0.3～1.2', () => {
  const t = K.computeTargets([{ leg: 'R', max: 0.55 }, { leg: 'L', max: 0.6 }, { leg: 'R', max: 0.52 }, { leg: 'L', max: 0.1 }], cfg);
  assert.deepEqual(t, { L: 0.65, R: 0.6 });
  assert.deepEqual(K.computeTargets([{ leg: 'R', max: 0.1 }, { leg: 'L', max: 1.5 }], cfg), { L: 1.2, R: 0.3 });
});

test('示範模式：4 下測量 + 10 下遊戲，進 9 球', () => {
  const demo = new DemoSoccerPose();
  demo.noise = false;
  const smoother = new geo.LandmarkSmoother(0.5);
  const ex = new K.SoccerFeatureExtractor();
  const play = (tracker, offset, reps) => {
    demo.start(0, offset);
    const out = [];
    for (let ms = 0; out.length < reps && ms < 300000; ms += 1000 / FPS) {
      const f = ex.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return { out, tracker };
  };
  const calib = play(new K.SoccerTracker(cfg, { calibrating: true }), 0, 4);
  assert.deepEqual(calib.out.map(e => e.rep.leg), ['R', 'L', 'R', 'L']);
  const targets = K.computeTargets(calib.out.map(e => ({ leg: e.rep.leg, max: e.rep.max })), cfg);
  assert.ok(Math.abs(targets.R - 0.6) <= 0.02 && Math.abs(targets.L - 0.65) <= 0.02, JSON.stringify(targets));

  const game = play(new K.SoccerTracker(cfg, { targets, baseline: calib.tracker.baseline }), 4, 10).out;
  assert.equal(game.length, 10);
  const scores = game.map(e => e.score);
  assert.equal(scores[4].reached, false);
  assert.deepEqual(scores[5].faults, ['trunkLean']);
  assert.deepEqual(scores[7].faults, ['bentKnee']);
  const sum = K.summarizeSoccer(scores, cfg);
  assert.equal(sum.goals, 9);
  assert.ok(sum.left && sum.right);
  assert.ok(sum.total >= 85 && sum.total <= 99, 'total=' + sum.total);
});
