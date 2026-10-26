// 執行：node --test tests/stats.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const ST = require('../js/stats.js');

const at = (day, h) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00').toISOString();
const sessions = [
  { date: at('2026-10-15', 9), exercise: 'knee-kick', reps: 10 },
  { date: at('2026-10-15', 15), exercise: 'knee-kick', reps: 10 },
  { date: at('2026-10-15', 16), exercise: 'finger-tap', reps: 10 },
  { date: at('2026-10-16', 23), exercise: 'knee-extension', reps: 20 },   // 舊版騎腳踏車
  { date: at('2026-10-17', 0), exercise: 'knee-lift', reps: 10 },
  { date: at('2026-10-17', 10), exercise: 'cross-tap', reps: 0, painStop: true },
  { date: at('2026-10-17', 11), exercise: 'shoulder-flexion', reps: 10, demo: true }   // 示範不算
];

test('每天每種動作的次數：依當地日期分天，示範試玩不算', () => {
  const u = ST.buildUsage(sessions);
  assert.deepEqual(u['2026-10-15'], { 'knee-kick': 2, 'finger-tap': 1 });
  assert.deepEqual(u['2026-10-16'], { 'knee-extension': 1 });
  assert.deepEqual(u['2026-10-17'], { 'knee-lift': 1, 'cross-tap': 1 });
});

test('統計表：區間內每一天都有一列，新的日期在上，欄位照首頁順序', () => {
  const t = ST.table(ST.buildUsage(sessions), '2026-10-14', '2026-10-17');
  assert.deepEqual(ST.GAMES.map(g => g.name), ['彈鋼琴', '雙手聯彈', '打鼓', '摘果子', '騎腳踏車', '踢足球']);
  assert.deepEqual(t.rows.map(r => r.day), ['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14']);
  assert.deepEqual(t.rows[0].counts, [0, 0, 1, 0, 1, 0]);
  assert.deepEqual(t.rows[1].counts, [0, 0, 0, 0, 1, 0]);   // 舊版騎腳踏車也算騎腳踏車
  assert.deepEqual(t.rows[2].counts, [1, 0, 0, 0, 0, 2]);
  assert.equal(t.rows[3].total, 0);
  assert.deepEqual(t.totals, [1, 0, 1, 0, 2, 2]);
  assert.equal(t.total, 6);
  assert.equal(t.activeDays, 3);
});

test('起訖日期顛倒時自動對調；只選一天也可以', () => {
  const u = ST.buildUsage(sessions);
  const t = ST.table(u, '2026-10-17', '2026-10-15');
  assert.equal(t.from, '2026-10-15');
  assert.equal(t.rows.length, 3);
  const one = ST.table(u, '2026-10-15', '2026-10-15');
  assert.equal(one.rows.length, 1);
  assert.equal(one.total, 3);
});

test('快速選擇：最近 7 天、最近 30 天、這個月；跨月也正確', () => {
  const today = new Date(2026, 9, 17);
  assert.deepEqual(ST.preset('7', today), { from: '2026-10-11', to: '2026-10-17' });
  assert.deepEqual(ST.preset('30', today), { from: '2026-09-18', to: '2026-10-17' });
  assert.deepEqual(ST.preset('month', today), { from: '2026-10-01', to: '2026-10-17' });
  assert.equal(ST.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(ST.dayLabel('2026-10-17'), '10/17（六）');
});
