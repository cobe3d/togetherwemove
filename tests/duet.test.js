// 執行：node --test tests/duet.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/finger-bend.js');
const DU = require('../js/duet.js');
const { DemoDuetPose, buildDuetLandmarks } = require('../js/demo-duet.js');

const FPS = 30;

// 依序做每一步（{hand, f, sloppy?}），回傳事件
function run(tracker, steps) {
  const fx = new DU.DuetFeatureExtractor();
  const events = [];
  let t = 0;
  const push = o => { for (const e of tracker.update(fx.extract(buildDuetLandmarks(o, false)), t)) events.push(e); t += 1 / FPS; };
  for (let i = 0; i < 6; i++) push(null);
  for (const s of steps) {
    for (let i = 0; i <= 12; i++) push(Object.assign({ p: i / 12 }, s));
    for (let i = 0; i < 8; i++) push(Object.assign({ p: 1 }, s));
    for (let i = 0; i <= 12; i++) push(Object.assign({ p: 1 - i / 12 }, s));
    for (let i = 0; i < 5; i++) push(null);
  }
  return events;
}
const round = (extra = {}) => cfg.sequence.flatMap(f => [Object.assign({ hand: 'L', f }, extra), Object.assign({ hand: 'R', f }, extra)]);

test('彎曲特徵：張開時都接近 0，彎下的那隻接近 1，旁邊手指不受影響', () => {
  const fx = new DU.DuetFeatureExtractor();
  const open = fx.extract(buildDuetLandmarks(null, false));
  assert.equal(open.upright, true);
  for (const h of ['L', 'R']) for (const k of cfg.fingers) assert.ok(open.hands[h].bend[k] < 0.1, h + k + '=' + open.hands[h].bend[k]);
  for (const k of cfg.fingers) {
    const f = fx.extract(buildDuetLandmarks({ hand: 'L', f: k, p: 1 }, false));
    assert.ok(f.hands.L.bend[k] > 0.9, 'L' + k + '=' + f.hands.L.bend[k]);
    assert.ok(f.hands.R.bend[k] < 0.1, '右手不動');
    for (const g of cfg.fingers) if (g !== k && !(k === 'R' && g === 'P')) assert.ok(f.hands.L.bend[g] < 0.3, k + '/' + g + '=' + f.hands.L.bend[g]);
  }
});

test('一回：左右手輪流，18 下都彎對，滿分', () => {
  const tr = new DU.BendTracker(cfg, { thr: 0.5 });
  const ev = run(tr, round());
  const bends = ev.filter(e => e.type === 'bend');
  assert.equal(bends.length, 18);
  assert.deepEqual(bends.slice(0, 4).map(e => e.hand + e.finger), ['LT', 'RT', 'LI', 'RI']);
  const rep = ev.filter(e => e.type === 'rep');
  assert.equal(rep.length, 1);
  const s = rep[0].score;
  assert.deepEqual([s.correct, s.indep, s.depth, s.tempo, s.total], [40, 30, 20, 10, 100]);
});

test('彎錯手指、用錯手：提醒，不算這一步', () => {
  const tr = new DU.BendTracker(cfg, { thr: 0.5 });
  const steps = round();
  steps.splice(4, 0, { hand: 'L', f: 'R' });        // 該彎左手中指，卻彎了左手無名指
  steps.splice(7, 0, { hand: 'R', f: 'R' });        // 該彎左手無名指，卻用了右手
  const ev = run(tr, steps);
  assert.deepEqual(ev.filter(e => e.type === 'wrong').map(e => e.hand + e.finger), ['LR']);
  assert.deepEqual(ev.filter(e => e.type === 'wrongHand').map(e => e.hand + e.finger), ['RR']);
  const s = ev.find(e => e.type === 'rep').score;
  assert.equal(s.correct, 20);
  assert.ok(s.faults.includes('wrongFinger'));
});

test('旁邊手指跟著彎到底：扣「其他手指伸直」分', () => {
  const tr = new DU.BendTracker(cfg, { thr: 0.5 });
  const s = run(tr, round({ sloppy: true })).find(e => e.type === 'rep').score;
  assert.ok(s.indep < 20, 'indep=' + s.indep);
  assert.ok(s.faults.includes('otherBent'));
});

test('個人判定：最難彎的手指 × 0.6，介於 0.3～0.5', () => {
  assert.equal(DU.computeThr([1, 0.95, 1, 0.9], cfg), 0.5);
  assert.equal(DU.computeThr([0.7, 0.75, 1], cfg), 0.42);
  assert.equal(DU.computeThr([0.3, 1], cfg), 0.3);
});

test('示範模式：1 回測量 + 4 回遊戲', () => {
  const demo = new DemoDuetPose();
  demo.noise = false;
  const fx = new DU.DuetFeatureExtractor();
  const smoother = new geo.LandmarkSmoother(0.6);
  const play = (tracker, offset, reps) => {
    demo.start(0, offset);
    const out = [];
    for (let ms = 0; out.length < reps && ms < 400000; ms += 1000 / FPS) {
      const f = fx.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return out;
  };
  const calib = play(new DU.BendTracker(cfg, { calibrating: true }), 0, 1);
  assert.equal(calib.length, 1);
  const thr = DU.computeThr(Object.values(calib[0].score.perFinger), cfg);
  assert.equal(thr, 0.5);

  const game = play(new DU.BendTracker(cfg, { thr }), 1, 4).map(e => e.score);
  assert.equal(game.length, 4);
  assert.ok(game.every(s => s.bends === 18));
  assert.deepEqual(game[1].faults, ['wrongFinger']);
  assert.deepEqual(game[2].faults, ['otherBent']);
  const sum = DU.summarizeDuet(game, cfg);
  assert.equal(sum.bends, 72);
  assert.ok(sum.total >= 80 && sum.total <= 98, 'total=' + sum.total);
});
