// 回春花園：每天運動澆一次水讓花長大；每次運動集點，集滿可換購物金
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const RULES = {
    bloomDays: 14,        // 澆水 14 天開一朵花
    pointsPerSession: 1,  // 每次運動完得 1 點
    dailyCap: 3,          // 每天最多 3 點
    redeemPoints: 10,     // 10 點
    redeemValue: 50       // 換 50 元購物金
  };

  const STAGES = [
    { id: 'seed', label: '種子', from: 0 },
    { id: 'sprout', label: '發芽', from: 1 },
    { id: 'seedling', label: '小苗', from: 3 },
    { id: 'grown', label: '長葉子', from: 6 },
    { id: 'bud', label: '花苞', from: 10 }
  ];
  const BLOOM = { id: 'bloom', label: '開花了' };
  const FLOWER_COLORS = ['#F4A6B8', '#F2B33D', '#E0412F', '#B39DDB', '#7FB3E6'];

  function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  // 有運動的天數（示範模式不算）
  function waterDays(sessions) {
    return new Set(sessions.filter(s => !s.demo && s.reps > 0).map(s => dayKey(s.date))).size;
  }

  function growth(days) {
    const n = RULES.bloomDays;
    const flowers = Math.floor(days / n);
    // 剛好滿 14 天的那天，顯示盛開的花；隔天再種下新種子
    if (days > 0 && days % n === 0) {
      return { flowers, inCycle: n, stage: BLOOM, daysToBloom: 0, bloomedNow: true };
    }
    const inCycle = days % n;
    let stage = STAGES[0];
    for (const s of STAGES) if (inCycle >= s.from) stage = s;
    return { flowers, inCycle, stage, daysToBloom: n - inCycle, bloomedNow: false };
  }

  function balance(ledger) {
    return ledger.reduce((s, e) => s + e.delta, 0);
  }

  function earnedOn(ledger, day) {
    return ledger.filter(e => e.delta > 0 && dayKey(e.date) === day).reduce((s, e) => s + e.delta, 0);
  }

  // 首頁「我的點數」：目前點數、今天得了幾點、累計、兌換紀錄、離下一張購物金還差幾點
  function pointsSummary(ledger, now) {
    const R = RULES;
    const bal = balance(ledger);
    const today = earnedOn(ledger, dayKey(now || new Date()));
    const redeems = ledger.filter(e => e.reason === 'redeem');
    return {
      balance: bal,
      today,
      cap: R.dailyCap,
      leftToday: Math.max(0, R.dailyCap - today),
      earned: ledger.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0),
      redeemed: redeems.length,
      redeemedValue: redeems.reduce((s, e) => s + (e.value || 0), 0),
      pending: redeems.filter(e => e.status === '待核發').length,
      canRedeem: bal >= R.redeemPoints,
      toNext: Math.max(0, R.redeemPoints - bal),
      progress: Math.min(bal, R.redeemPoints) / R.redeemPoints
    };
  }

  // 完成整回合得點；因疼痛提早停止也給點，不鼓勵忍痛做完
  function earnsPoint(session) {
    if (session.demo || !(session.reps > 0)) return false;
    return session.reason === 'done' || session.reason === 'pain';
  }

  // 回傳這次要加的點數（0 表示今天已達上限或不符合）
  function pointsFor(session, ledger, now) {
    if (!earnsPoint(session)) return 0;
    const today = earnedOn(ledger, dayKey(now || new Date()));
    return Math.max(0, Math.min(RULES.pointsPerSession, RULES.dailyCap - today));
  }

  function redeemCode(now) {
    const d = new Date(now || Date.now());
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tail = '';
    for (let i = 0; i < 4; i++) tail += chars[Math.floor(Math.random() * chars.length)];
    return 'RC' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + tail;
  }

  // ---------- 插畫 ----------
  function flowerHead(cx, cy, r, color) {
    let s = '';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s += '<circle cx="' + (cx + Math.cos(a) * r).toFixed(1) + '" cy="' + (cy + Math.sin(a) * r).toFixed(1) + '" r="' + (r * 0.75).toFixed(1) + '" fill="' + color + '"/>';
    }
    return s + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.7).toFixed(1) + '" fill="#F2B33D"/>';
  }

  function leaf(x, y, side, size) {
    const rot = side < 0 ? -35 : 35;
    return '<ellipse cx="' + (x + side * size * 0.9) + '" cy="' + y + '" rx="' + size + '" ry="' + (size * 0.45).toFixed(1) +
      '" fill="#4C9C62" transform="rotate(' + rot + ' ' + (x + side * size * 0.9) + ' ' + y + ')"/>';
  }

  // 盆栽：依階段畫出不同大小
  function plantSVG(stageId, colorIndex) {
    const color = FLOWER_COLORS[(colorIndex || 0) % FLOWER_COLORS.length];
    const heights = { seed: 0, sprout: 22, seedling: 46, grown: 78, bud: 98, bloom: 104 };
    const h = heights[stageId] || 0;
    const base = 142, top = base - h;
    let g = '';
    if (stageId === 'seed') {
      g += '<ellipse cx="100" cy="139" rx="9" ry="5.5" fill="#8B5E3C"/>';
    } else {
      g += '<path d="M100 ' + base + ' V' + top + '" stroke="#3E8A55" stroke-width="6" stroke-linecap="round"/>';
      if (stageId === 'sprout') {
        g += leaf(100, top + 2, -1, 11) + leaf(100, top + 2, 1, 11);
      } else {
        g += leaf(100, base - h * 0.35, -1, 18) + leaf(100, base - h * 0.5, 1, 18);
        if (stageId !== 'seedling') g += leaf(100, base - h * 0.68, -1, 15) + leaf(100, base - h * 0.8, 1, 14);
        else g += leaf(100, top + 4, -1, 12) + leaf(100, top + 4, 1, 12);
      }
      if (stageId === 'bud') {
        g += '<ellipse cx="100" cy="' + (top - 10) + '" rx="11" ry="16" fill="' + color + '"/>' +
          '<path d="M88 ' + (top - 2) + ' Q100 ' + (top + 6) + ' 112 ' + (top - 2) + ' L100 ' + (top - 10) + 'Z" fill="#3E8A55"/>';
      }
      if (stageId === 'bloom') g += flowerHead(100, top - 14, 15, color);
    }
    return '<svg viewBox="0 0 200 200" role="img" aria-label="花園植物：' + labelOf(stageId) + '">' +
      '<ellipse cx="100" cy="196" rx="52" ry="4" fill="#000000" fill-opacity=".08"/>' +
      g +
      '<rect x="56" y="140" width="88" height="16" rx="6" fill="#B5683A"/>' +
      '<path d="M62 156 H138 L128 194 H72 Z" fill="#C77A4A"/>' +
      '<ellipse cx="100" cy="142" rx="38" ry="6" fill="#6B4A32"/>' +
      '</svg>';
  }

  function labelOf(id) {
    if (id === 'bloom') return BLOOM.label;
    const s = STAGES.find(x => x.id === id);
    return s ? s.label : '';
  }

  // 花圃：已經開過的花
  function bedSVG(flowers) {
    const show = Math.min(flowers, 12);
    let g = '<rect x="0" y="62" width="480" height="38" rx="12" fill="#8B5E3C"/><rect x="0" y="62" width="480" height="10" rx="5" fill="#6B4A32"/>';
    for (let i = 0; i < show; i++) {
      const x = 24 + i * 39, hgt = 30 + (i % 3) * 6;
      g += '<path d="M' + x + ' 66 V' + (66 - hgt) + '" stroke="#3E8A55" stroke-width="4" stroke-linecap="round"/>' +
        leaf(x, 66 - hgt * 0.4, i % 2 ? 1 : -1, 8) + flowerHead(x, 66 - hgt - 6, 8, FLOWER_COLORS[i % FLOWER_COLORS.length]);
    }
    return '<svg viewBox="0 0 480 100" role="img" aria-label="花圃裡有 ' + flowers + ' 朵花">' + g + '</svg>';
  }

  RCDD.garden = { RULES, STAGES, dayKey, waterDays, growth, balance, earnedOn, pointsSummary, earnsPoint, pointsFor, redeemCode, plantSVG, bedSVG, labelOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.garden;
})(typeof window !== 'undefined' ? window : globalThis);
