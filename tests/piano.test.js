// 執行：node --test tests/piano.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const geo = require('../js/angle.js');
const cfg = require('../exercises/finger-tap.js');
const PN = require('../js/piano.js');
const { DemoHandPose, buildHandLandmarks } = require('../js/demo-hand.js');

const FPS = 30;
const fx = new PN.HandFeatureExtractor();
const feat = (finger, p, hand) => fx.extract(buildHandLandmarks(finger, p, hand || 'R', false));

// 每一段：碰某隻手指（p 從 0 → 1 → back）
function run(tracker, steps) {
  const events = [];
  let t = 0;
  const push = f => { for (const e of tracker.update(f, t)) events.push(e); t += 1 / FPS; };
  for (const s of steps) {
    if (s.hidden) { for (let i = 0; i < s.sec * FPS; i++) push(null); continue; }
    const back = s.back == null ? 0 : s.back;
    for (let i = 0; i <= 15; i++) push(feat(s.f, i / 15, s.hand));
    for (let i = 0; i < 9; i++) push(feat(s.f, 1, s.hand));
    for (let i = 0; i <= 15; i++) push(feat(s.f, 1 - (1 - back) * i / 15, s.hand));
    for (let i = 0; i < 6; i++) push(feat(s.f, back, s.hand));
  }
  return events;
}
const round = (seq, extra = {}) => seq.map(f => Object.assign({ f }, extra));

test('手部特徵：張開時拇指離各指尖遠，碰到時很近', () => {
  const open = feat(null, 0);
  assert.equal(open.upright, true);
  for (const k of PN.FINGERS) assert.ok(open.d[k] > 0.6, k + '=' + open.d[k]);
  for (const k of PN.FINGERS) {
    const f = feat(k, 1);
    assert.ok(f.d[k] < 0.15, k + ' touch=' + f.d[k]);
  }
  const left = feat('M', 1, 'L');
  assert.ok(left.d.M < 0.15);
});

test('單向一回：食指到小指，四下都碰到，滿分', () => {
  const tr = new PN.FingerTracker(cfg, { touch: 0.25 });
  const ev = run(tr, round(['I', 'M', 'R', 'P']));
  assert.deepEqual(ev.filter(e => e.type === 'touch').map(e => e.finger), ['I', 'M', 'R', 'P']);
  const rep = ev.filter(e => e.type === 'rep');
  assert.equal(rep.length, 1);
  const s = rep[0].score;
  assert.deepEqual([s.reach, s.order, s.open, s.tempo, s.total], [40, 30, 20, 10, 100]);
  assert.equal(s.notes, 4);
});

test('來回一回：食指 → 小指 → 食指，共 7 下', () => {
  const seq = cfg.sequences.roundtrip;
  const tr = new PN.FingerTracker(cfg, { touch: 0.25, sequence: seq });
  const ev = run(tr, round(seq));
  assert.deepEqual(ev.filter(e => e.type === 'touch').map(e => e.finger), seq);
  assert.equal(ev.filter(e => e.type === 'rep').length, 1);
  assert.equal(ev.find(e => e.type === 'rep').score.total, 100);
});

test('碰錯手指：不計，提醒並扣順序分', () => {
  const tr = new PN.FingerTracker(cfg, { touch: 0.25 });
  const ev = run(tr, round(['I', 'R', 'M', 'R', 'P']));
  const wrong = ev.filter(e => e.type === 'wrong');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].expect, 'M');
  const s = ev.find(e => e.type === 'rep').score;
  assert.equal(s.order, 20);
  assert.deepEqual(s.faults, ['wrongFinger']);
});

test('手指沒有張開（拇指直接滑過去）：仍計分但扣張開分', () => {
  const tr = new PN.FingerTracker(cfg, { touch: 0.25 });
  const events = [];
  let t = 0;
  const push = f => { for (const e of tr.update(f, t)) events.push(e); t += 1 / FPS; };
  const slide = (from, to) => {
    for (let i = 0; i <= 15; i++) push(fx.extract(buildHandLandmarks(to, 1, 'R', false, { from, u: i / 15 })));
    for (let i = 0; i < 9; i++) push(feat(to, 1));
  };
  for (let i = 0; i <= 15; i++) push(feat('I', i / 15));
  for (let i = 0; i < 9; i++) push(feat('I', 1));
  slide('I', 'M'); slide('M', 'R'); slide('R', 'P');
  for (let i = 0; i <= 15; i++) push(feat('P', 1 - i / 15));
  const ev = events;
  assert.deepEqual(ev.filter(e => e.type === 'touch').map(e => e.finger), ['I', 'M', 'R', 'P']);
  const s = ev.find(e => e.type === 'rep').score;
  assert.ok(s.open < 15, 'open=' + s.open);
  assert.ok(s.faults.includes('noOpen'));
});

test('看不到手超過 1.2 秒才提示', () => {
  const tr = new PN.FingerTracker(cfg, { touch: 0.25 });
  const ev = run(tr, [{ hidden: true, sec: 2 }, { f: 'I' }]);
  assert.deepEqual(ev.map(e => e.type).slice(0, 3), ['lost', 'found', 'touch']);
});

test('個人判定距離：0.22～0.6 倍手掌大小', () => {
  assert.equal(PN.computeTouch([0.05, 0.08, 0.1, 0.12], cfg), 0.22);
  assert.equal(PN.computeTouch([0.2, 0.4], cfg), 0.52);
  assert.equal(PN.computeTouch([0.7], cfg), 0.6);
});

test('示範模式：2 回測量 + 右手 5 回 + 左手 5 回', () => {
  const demo = new DemoHandPose();
  demo.noise = false;
  const smoother = new geo.LandmarkSmoother(0.5);
  const play = (tracker, offset, reps, hand) => {
    demo.prefer = hand;
    demo.start(0, offset);
    smoother.reset();
    const out = [];
    for (let ms = 0; out.length < reps && ms < 200000; ms += 1000 / FPS) {
      const f = fx.extract(smoother.smooth(demo.read(ms)));
      for (const e of tracker.update(f, ms / 1000)) if (e.type === 'rep') out.push(e);
    }
    return out;
  };
  const calib = play(new PN.FingerTracker(cfg, { calibrating: true }), 0, 2, 'R');
  assert.equal(calib.length, 2);
  const mins = [];
  for (const e of calib) for (const k in e.score.perFinger) mins.push(e.score.perFinger[k]);
  const touch = PN.computeTouch(mins, cfg);
  assert.equal(touch, 0.22);

  const right = play(new PN.FingerTracker(cfg, { touch }), 2, 5, 'R').map(e => Object.assign(e.score, { hand: 'R' }));
  const left = play(new PN.FingerTracker(cfg, { touch }), 7, 5, 'L').map(e => Object.assign(e.score, { hand: 'L' }));
  assert.equal(right.length, 5);
  assert.equal(left.length, 5);
  assert.deepEqual(right[2].faults, ['wrongFinger']);
  assert.ok(right.every(s => s.notes === 4) && left.every(s => s.notes === 4));
  assert.deepEqual(left[1].faults, ['noOpen']);
  const sum = PN.summarizePiano([...right, ...left], cfg);
  assert.equal(sum.notes, 40);
  assert.ok(sum.right != null && sum.left != null);
  assert.ok(sum.total >= 85 && sum.total <= 99, 'total=' + sum.total);
});
