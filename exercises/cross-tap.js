// 動作設定：跨體拍肩（打鼓）
// 治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['cross-tap'] = {
    id: 'cross-tap',
    name: '跨體拍肩',
    game: '打鼓',
    view: 'front',           // 正面對鏡頭
    reps: 12,                // 左右各 6 下
    calibrationReps: 4,      // 能力測量：左右各 2 下
    defaultTouch: 0.3,       // 手腕到對側肩 < 肩寬 × 0.3 = 拍到
    minTouch: 0.3,
    maxTouch: 0.8,           // 碰不到肩膀時，最多放寬到上臂
    calibTouch: 0.9,         // 能力測量時的寬鬆判定
    touchBonus: 1.25,        // 個人判定 = 測量時最遠的一次 × 1.25
    countRatio: 1.6,         // 沒拍到但距離在判定 1.6 倍內，仍算 1 下（分數較低）
    restDrop: 0.8,           // 手腕低於肩線 肩寬 × 0.8 = 手放下
    interval: { start: 3, min: 2, max: 4.5 },  // 鼓點間隔（秒），依長輩速度自動調整
    timingZeroAfter: 6,      // 比間隔慢 6 秒以上，節拍分為 0
    checks: [
      { type: 'trunkRotate', label: '身體轉動', ratio: 0.8, penalty: 10, voice: '身體保持正面，不要轉過去' },
      { type: 'trunkTilt', label: '身體歪斜', maxDelta: 12, penalty: 10, voice: '身體坐正，不要歪一邊' },
      { type: 'headDrop', label: '低頭去碰', ratio: 0.6, penalty: 10, voice: '頭抬起來，用手去拍肩膀' }
    ],
    weights: { reach: 40, form: 30, timing: 20, alternate: 10 }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['cross-tap'];
})(typeof window !== 'undefined' ? window : globalThis);
