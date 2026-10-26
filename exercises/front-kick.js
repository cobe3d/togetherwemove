// 動作設定：站姿往前踢腿（踢足球，正面；站在椅子旁、一手扶椅背）
// 高度都用「肩寬」為單位：0.5 = 腳踝比平常站著時高出半個肩寬。
// 正面拍攝時腳往鏡頭方向踢出去，看的是腳踝在畫面上往上抬了多少。
// 治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['front-kick'] = {
    id: 'front-kick',
    name: '站姿踢腿',
    game: '踢足球',
    view: 'front',           // 正面對鏡頭
    reps: 10,                // 左右腳交替，各 5 下
    calibrationReps: 4,      // 能力測量：左右各 2 下
    restBelow: 0.08,         // 腳踝高度低於此值 = 腳放下
    activeAbove: 0.15,       // 高於此值 = 開始踢
    minRep: 0.22,            // 最高不到此值的小動作不計次
    targetBonus: 0.05,       // 個人目標 = 能力測量最高 + 0.05
    minTarget: 0.3,
    maxTarget: 1.2,
    defaultTarget: 0.6,
    nearRatio: 0.85,
    reachTolerance: 0.05,
    highRatio: 0.8,          // 踢到目標 80% 以上的畫面用來檢查姿勢
    tempo: { min: 0.6, max: 4 },   // 踢出去再收回一下約 0.6～4 秒
    checks: [
      { type: 'trunkLean', label: '身體後仰', ratio: 0.85, penalty: 10, voice: '身體站直，不要往後仰' },
      { type: 'trunkTilt', label: '身體歪斜', maxDelta: 10, penalty: 10, voice: '扶好椅背站穩，身體不要歪一邊' },
      // 膝蓋抬得幾乎和腳踝一樣多 = 彎著膝蓋抬腿，不是把腳往前踢出去
      { type: 'bentKnee', label: '膝蓋彎曲', ratio: 0.8, penalty: 10, voice: '腳盡量伸直，往前踢出去' }
    ],
    weights: { range: 50, form: 30, tempo: 20 }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['front-kick'];
})(typeof window !== 'undefined' ? window : globalThis);
