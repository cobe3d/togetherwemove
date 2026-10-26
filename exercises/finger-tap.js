// 動作設定：手指對指（彈鋼琴）
// 治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['finger-opposition'] = {
    id: 'finger-opposition',
    name: '手指對指',
    game: '彈鋼琴',
    view: 'hand',
    roundsPerHand: 5,        // 先右手 5 回，再左手 5 回
    reps: 10,
    calibrationReps: 2,      // 能力測量：右手 2 回
    restSeconds: 10,         // 換手前休息
    defaultTouch: 0.25,      // 拇指尖到指尖 < 手掌大小 × 0.25 = 碰到
    minTouch: 0.22,
    maxTouch: 0.6,           // 手指碰不到時，最多放寬到指腹附近
    calibTouch: 0.6,
    touchBonus: 1.3,         // 個人判定 = 測量時最難碰的那隻手指 × 1.3
    open: 0.6,               // 碰完要張開到手掌大小 × 0.6 以上
    openMargin: 0.25,
    tempo: { min: 0.5, max: 3 },   // 每下間隔（秒）
    sequences: {
      oneway: ['I', 'M', 'R', 'P'],
      roundtrip: ['I', 'M', 'R', 'P', 'R', 'M', 'I']
    },
    checks: [
      { type: 'wrongFinger', label: '碰錯手指', voice: '照順序來，看亮起來的那隻手指' },
      { type: 'noOpen', label: '沒有張開', voice: '每碰一下，手指要張開喔' }
    ],
    weights: { reach: 40, order: 30, open: 20, tempo: 10 }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['finger-opposition'];
})(typeof window !== 'undefined' ? window : globalThis);
