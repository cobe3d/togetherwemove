// 動作設定：肩關節前舉（摘果子）
// 治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['shoulder-flexion'] = {
    id: 'shoulder-flexion',
    name: '肩關節前舉',
    game: '摘果子',
    view: 'side',            // 側身對鏡頭
    angle: ['hip', 'shoulder', 'elbow'],
    startBelow: 40,          // 角度低於此值 = 手放下（準備）
    activeAbove: 50,         // 角度高於此值 = 開始抬手
    minRepAngle: 60,         // 最高角度不到此值的小動作不計次
    targetMax: 150,          // 治療師設定的目標上限
    minTarget: 70,           // 個人目標下限
    targetBonus: 5,          // 個人目標 = 能力測量最大值 + 5°
    holdTolerance: 5,        // 目標角度 -5° 以內就算到達
    holdSeconds: 2,
    nearRatio: 0.85,         // 到達目標 85% 時提示「再高一點點」
    highRatio: 0.8,          // 到達目標 80% 以上的畫面用來檢查姿勢
    reps: 10,
    calibrationReps: 3,
    tempo: { min: 1.5, max: 4 },
    checks: [
      { type: 'elbowBent', label: '手肘彎曲', minAngle: 160, penalty: 10, voice: '手肘再伸直一點' },
      { type: 'trunkLean', label: '身體後仰', maxDelta: 15, penalty: 10, voice: '身體坐正，不要往後仰' },
      { type: 'shrug', label: '聳肩', ratio: 0.75, penalty: 10, voice: '肩膀放輕鬆，不要聳肩' }
    ],
    weights: { range: 40, form: 30, hold: 20, tempo: 10 }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['shoulder-flexion'];
})(typeof window !== 'undefined' ? window : globalThis);
