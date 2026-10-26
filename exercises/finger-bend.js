// 動作設定：雙手手指彎曲（雙手聯彈）
// 兩手張開、掌心朝向鏡頭，依指示左右手輪流彎下指定的手指。治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['finger-bend'] = {
    id: 'finger-bend',
    name: '雙手手指彎曲',
    game: '雙手聯彈',
    view: 'hands',
    reps: 4,                 // 4 回 × 18 下（9 隻手指 × 左右手）；右手 36 下剛好彈到歌的尾聲
    calibrationReps: 1,
    defaultThr: 0.5,         // 彎曲程度（0 = 伸直、1 = 彎到底）到 0.5 算彎下
    minThr: 0.3,
    maxThr: 0.5,
    calibThr: 0.3,           // 能力測量時的寬鬆判定
    thrRatio: 0.6,           // 個人判定 = 測量時最難彎的手指 × 0.6
    straight: 0.25,          // 低於此值算伸直
    releaseBelow: 0.3,       // 彎下後要伸直到此值以下，才算完成這一下
    tempo: { min: 0.5, max: 3 },
    fingers: ['T', 'I', 'M', 'R', 'P'],
    // 來回：拇指 → 小指 → 拇指；每隻手指先左手、再右手
    sequence: ['T', 'I', 'M', 'R', 'P', 'R', 'M', 'I', 'T'],
    checks: [
      { type: 'wrongFinger', label: '彎錯手指', voice: '請彎亮起來的那隻手指' },
      { type: 'otherBent', label: '其他手指跟著彎', voice: '其他手指盡量伸直' }
    ],
    weights: { correct: 40, indep: 30, depth: 20, tempo: 10 }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['finger-bend'];
})(typeof window !== 'undefined' ? window : globalThis);
