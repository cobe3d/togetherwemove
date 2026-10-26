// 動作設定：站姿抬膝（騎腳踏車，正面；站在椅子旁、一手扶椅背）
// 高度都用「肩寬」為單位：0.5 = 膝蓋比平常站著時高出半個肩寬。治療師要調整標準時，只需要改這個檔案。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.exercises = RCDD.exercises || {};

  RCDD.exercises['knee-lift'] = {
    id: 'knee-lift',
    name: '站姿抬膝',
    game: '騎腳踏車',
    view: 'front',           // 正面對鏡頭
    reps: 10,                // 左右腳交替，各 5 下
    calibrationReps: 4,      // 能力測量：左右各 2 下
    restBelow: 0.08,         // 膝蓋高度低於此值 = 腳放下
    activeAbove: 0.14,       // 高於此值 = 開始抬腳
    minRep: 0.2,             // 最高不到此值的小動作不計次
    targetBonus: 0.05,       // 個人目標 = 能力測量最高 + 0.05
    minTarget: 0.25,
    maxTarget: 1.2,          // 站著把大腿抬到水平，約 1.1 個肩寬
    nearRatio: 0.85,
    reachTolerance: 0.05,
    highRatio: 0.8,          // 抬到目標 80% 以上的畫面用來檢查姿勢
    tempo: { min: 1.0, max: 5 },   // 抬起再放下一下約 1～5 秒
    checks: [
      { type: 'trunkLean', label: '身體後仰', ratio: 0.85, penalty: 15, voice: '身體站直，不要往後仰' },
      { type: 'trunkTilt', label: '身體歪斜', maxDelta: 10, penalty: 15, voice: '扶好椅背站穩，身體不要歪一邊' }
    ],
    weights: { range: 50, form: 30, tempo: 20 },
    // 從高雄出發環島，第幾下抵達哪一站
    start: '高雄',
    stops: [
      { at: 2, name: '墾丁', id: 'kenting' },
      { at: 4, name: '花蓮太魯閣', id: 'taroko' },
      { at: 5, name: '台北101', id: 'taipei101' },
      { at: 7, name: '日月潭', id: 'sunmoon' },
      { at: 9, name: '阿里山', id: 'alishan' },
      { at: 10, name: '高雄', id: 'kaohsiung' }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RCDD.exercises['knee-lift'];
})(typeof window !== 'undefined' ? window : globalThis);
