// 運動次數統計：每天每種運動做了幾次（示範試玩不算），可選日期區間
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  // 首頁卡片的順序；exercise 是紀錄裡存的動作代號
  const GAMES = [
    { id: 'piano', name: '彈鋼琴', exercise: ['finger-tap'] },
    { id: 'duet', name: '雙手聯彈', exercise: ['finger-bend'] },
    { id: 'drum', name: '打鼓', exercise: ['cross-tap'] },
    { id: 'apple', name: '摘果子', exercise: ['shoulder-flexion'] },
    // knee-extension 是舊版（側面）騎腳踏車的紀錄
    { id: 'bike', name: '騎腳踏車', exercise: ['knee-lift', 'knee-extension'] },
    // knee-kick 是改版前「放天燈」的紀錄
    { id: 'soccer', name: '踢足球', exercise: ['front-kick', 'knee-kick'] }
  ];
  const WEEK = '日一二三四五六';

  const pad = n => String(n).padStart(2, '0');
  function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }
  // 'YYYY-MM-DD' → 當地時間的那一天（避免被當成 UTC）
  function parseDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(key, n) {
    const d = parseDay(key);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }
  function dayLabel(key) {
    const d = parseDay(key);
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）';
  }

  // 每天每種動作的次數：{ '2026-10-17': { 'knee-kick': 2, ... } }
  function addUsage(usage, session) {
    if (!session || session.demo || !session.exercise) return usage;
    const k = dayKey(session.date);
    const day = usage[k] = usage[k] || {};
    day[session.exercise] = (day[session.exercise] || 0) + 1;
    return usage;
  }
  function buildUsage(sessions) {
    return (sessions || []).reduce(addUsage, {});
  }

  // 區間內每一天的統計（新的日期在上面）；起訖顛倒時自動對調
  function table(usage, from, to) {
    if (from > to) [from, to] = [to, from];
    const rows = [];
    const totals = GAMES.map(() => 0);
    for (let k = to; k >= from; k = addDays(k, -1)) {
      const day = usage[k] || {};
      const counts = GAMES.map(g => g.exercise.reduce((s, e) => s + (day[e] || 0), 0));
      counts.forEach((c, i) => { totals[i] += c; });
      rows.push({ day: k, counts, total: counts.reduce((s, c) => s + c, 0) });
      if (rows.length > 3660) break;
    }
    return { from, to, rows, totals, total: totals.reduce((s, c) => s + c, 0), activeDays: rows.filter(r => r.total > 0).length };
  }

  // 快速選擇：最近 7 天、最近 30 天、這個月
  function preset(name, today) {
    const t = dayKey(today || new Date());
    if (name === '30') return { from: addDays(t, -29), to: t };
    if (name === 'month') return { from: t.slice(0, 8) + '01', to: t };
    return { from: addDays(t, -6), to: t };
  }

  RCDD.stats = { GAMES, dayKey, addDays, dayLabel, addUsage, buildUsage, table, preset };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.stats;
})(typeof window !== 'undefined' ? window : globalThis);
