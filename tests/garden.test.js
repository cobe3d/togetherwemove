// 執行：node --test tests/garden.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/garden.js');

const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h).toISOString();

test('只算有運動的天數，同一天多次只算一天，示範不算', () => {
  const sessions = [
    { date: at(2026, 10, 15), reps: 10 },
    { date: at(2026, 10, 15, 18), reps: 10 },
    { date: at(2026, 10, 16), reps: 10, demo: true },
    { date: at(2026, 10, 17), reps: 0 },
    { date: at(2026, 10, 17, 10), reps: 4 }
  ];
  assert.equal(G.waterDays(sessions), 2);
});

test('花的成長階段：14 天開花，隔天重新種', () => {
  assert.equal(G.growth(0).stage.id, 'seed');
  assert.equal(G.growth(1).stage.id, 'sprout');
  assert.equal(G.growth(3).stage.id, 'seedling');
  assert.equal(G.growth(6).stage.id, 'grown');
  assert.equal(G.growth(13).stage.id, 'bud');
  assert.equal(G.growth(13).daysToBloom, 1);
  const b = G.growth(14);
  assert.equal(b.stage.id, 'bloom');
  assert.equal(b.flowers, 1);
  assert.equal(G.growth(15).stage.id, 'sprout');
  assert.equal(G.growth(15).flowers, 1);
  assert.equal(G.growth(28).flowers, 2);
});

test('完成運動得 1 點；疼痛停止也給點；中途結束、示範不給點', () => {
  const now = new Date(2026, 9, 17, 10);
  assert.equal(G.pointsFor({ reps: 10, reason: 'done' }, [], now), 1);
  assert.equal(G.pointsFor({ reps: 3, reason: 'pain' }, [], now), 1);
  assert.equal(G.pointsFor({ reps: 0, reason: 'pain' }, [], now), 0);
  assert.equal(G.pointsFor({ reps: 6, reason: 'stopped' }, [], now), 0);
  assert.equal(G.pointsFor({ reps: 10, reason: 'done', demo: true }, [], now), 0);
});

test('每天最多 3 點，隔天重新計算', () => {
  const now = new Date(2026, 9, 17, 20);
  const ledger = [1, 2, 3].map(h => ({ date: new Date(2026, 9, 17, h).toISOString(), delta: 1 }));
  assert.equal(G.pointsFor({ reps: 10, reason: 'done' }, ledger, now), 0);
  assert.equal(G.pointsFor({ reps: 10, reason: 'done' }, ledger, new Date(2026, 9, 18, 9)), 1);
});

test('點數餘額扣掉兌換', () => {
  const ledger = Array.from({ length: 120 }, () => ({ date: at(2026, 10, 1), delta: 1 }));
  ledger.push({ date: at(2026, 10, 17), delta: -100, reason: 'redeem' });
  assert.equal(G.balance(ledger), 20);
  assert.equal(G.earnedOn(ledger, '2026-10-17'), 0);
});

test('兌換碼格式', () => {
  assert.match(G.redeemCode(new Date(2026, 9, 17)), /^RC1017-[A-Z2-9]{4}$/);
});

test('每個階段都畫得出插畫', () => {
  for (const id of ['seed', 'sprout', 'seedling', 'grown', 'bud', 'bloom']) {
    assert.match(G.plantSVG(id, 0), /^<svg[\s\S]*<\/svg>$/);
  }
  assert.match(G.bedSVG(3), /3 朵花/);
});

test('我的點數摘要：目前點數、今天已得、累計、兌換紀錄、離下一張購物金', () => {
  const now = new Date(2026, 9, 17, 20);
  const ledger = [
    { date: at(2026, 10, 10), delta: 1, reason: 'session' },
    ...Array.from({ length: 10 }, (_, i) => ({ date: at(2026, 10, 11 + Math.floor(i / 3), 9 + i), delta: 1, reason: 'session' })),
    { date: at(2026, 10, 15), delta: -10, reason: 'redeem', value: 50, code: 'RC1015-AAAA', status: '待核發' },
    { date: at(2026, 10, 17, 8), delta: 1, reason: 'session' },
    { date: at(2026, 10, 17, 10), delta: 1, reason: 'session' }
  ];
  const s = G.pointsSummary(ledger, now);
  assert.equal(s.balance, 3);
  assert.deepEqual([s.today, s.cap, s.leftToday], [2, 3, 1]);
  assert.equal(s.earned, 13);
  assert.deepEqual([s.redeemed, s.redeemedValue, s.pending], [1, 50, 1]);
  assert.deepEqual([s.canRedeem, s.toNext], [false, 7]);
  assert.ok(Math.abs(s.progress - 0.3) < 1e-9);
  const empty = G.pointsSummary([], now);
  assert.deepEqual([empty.balance, empty.today, empty.leftToday, empty.toNext, empty.progress], [0, 0, 3, 10, 0]);
});
