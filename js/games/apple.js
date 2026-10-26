// 遊戲定義：摘果子（肩關節前舉）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const EX = RCDD.exercise;
  const cfg = RCDD.exercises['shoulder-flexion'];

  RCDD.games.apple = {
    id: 'apple',
    name: '摘果子',
    motion: '肩關節前舉',
    cfg,
    seenKey: 'tutorialSeen',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      { id: 'arm', label: '看得到肩膀、手肘、手腕', hint: '請往後坐一點，讓我看到您的肩膀、手肘和手腕', test: f => !!(f && f.visible) },
      { id: 'side', label: '側身面對鏡頭', hint: '請把身體轉向側面，讓要舉的手靠近鏡頭', test: f => !!(f && f.visible && f.shoulderSpread < 0.55) },
      { id: 'ready', label: '手放下，準備好', hint: '請先把手放下來，放在大腿上', test: f => !!(f && f.visible && f.shoulderAngle < cfg.startBelow) }
    ],
    checkVoice: '請側身坐好，讓我看到您的手臂',

    newScene: canvas => new RCDD.AppleScene(canvas),
    newExtractor: () => new EX.FeatureExtractor(),
    newDemo: () => new RCDD.DemoPose(),

    newTracker({ calibrating, profile, baseline }) {
      const tr = new EX.RepTracker(cfg, calibrating ? cfg.targetMax : profile.target);
      if (baseline) tr.baseline = Object.assign({}, baseline);
      return tr;
    },

    calibIntro: ['先做 3 下，讓我認識您的手臂。把手慢慢往前舉高，舉到最高就好，不用勉強。', '先做 3 下，舉到最高就好'],
    calibStartBubble: '慢慢舉高，舉到最高就好',
    onCalibRep(e, ctx) {
      ctx.voice.sfx.drop();
      return e.rep.max;
    },
    calibRepSay(e, n) {
      return ['很好，第 ' + n + ' 下，舉到 ' + Math.round(e.rep.max) + ' 度', '很好！舉到 ' + Math.round(e.rep.max) + '°'];
    },
    finishCalibration(values, old) {
      const target = EX.computeTarget(values, cfg);
      const best = Math.round(Math.max(...values));
      return {
        profile: { target, baseline: best, firstMax: old && old.firstMax ? old.firstMax : best, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: '您的手可以舉到 ' + best + '°\n今天的目標：' + target + '°',
        voice: '測量完成！您的手可以舉到 ' + best + ' 度。目標是 ' + target + ' 度，我們開始摘蘋果吧！',
        button: '開始摘蘋果'
      };
    },
    hasProfile: p => !!(p && p.target),

    gameIntro: ['把手慢慢往前舉高，摘下樹上的蘋果', '往前舉高，摘下蘋果'],
    onStartGame(ctx) { ctx.S.picked = 0; },

    onEvent(e, ctx) {
      if (e.type === 'start') ctx.bubble('慢慢往前舉高');
      else if (e.type === 'near') ctx.say('再高一點點，就摘到了！', 1);
      else if (e.type === 'reached') ctx.say('很好，撐住！', 1);
      else if (e.type === 'picked') {
        ctx.S.picked++;
        ctx.voice.sfx.pick();
        ctx.say('摘到了！', 2);
        ctx.scene.launchApple(ctx.basketPoint(), false, () => ctx.addBasket(''));
      }
    },

    onRep(e, ctx) {
      const n = ctx.S.scores.length;
      if (!e.rep.picked) {
        // 沒摘到也算數：掉下一顆小蘋果
        ctx.voice.sfx.drop();
        ctx.scene.launchApple(ctx.basketPoint(), true, () => ctx.addBasket('small'));
      }
      if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      else if (!e.rep.picked) ctx.say('很好，下一下再高一點點', 1);
      else if (n === Math.ceil(cfg.reps / 2)) ctx.say('已經做一半了，很棒！', 1);
    },

    drawParams(S) {
      const cur = S.tracker ? S.tracker.current : null;
      return {
        target: S.phase === 'calibrate' ? cfg.targetMax : (S.profile ? S.profile.target : cfg.targetMax),
        holdProgress: cur ? cur.holdProgress : 0,
        reached: cur ? cur.reached : false,
        repPicked: cur ? cur.picked : false,
        picked: S.picked
      };
    },

    updateHud(S, $) {
      const calibrating = S.phase === 'calibrate';
      const target = calibrating ? cfg.targetMax : S.profile.target;
      const top = target + 15;
      const a = S.feat && S.feat.visible ? S.feat.shoulderAngle : 0;
      $('gaugeFill').style.height = (100 * Math.min(a, top) / top).toFixed(1) + '%';
      $('gaugeTarget').hidden = calibrating;
      $('gaugeTarget').style.bottom = (100 * target / top).toFixed(1) + '%';
    },

    summarize: scores => EX.summarizeSession(scores, cfg),
    record: sum => ({ maxAngle: sum.maxAngle, picked: sum.picked }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['動作幅度', sum.parts.range, w.range, '#2E6B4E'],
        ['姿勢正確', sum.parts.form, w.form, '#4C9C62'],
        ['維持時間', sum.parts.hold, w.hold, '#E0A126'],
        ['節奏穩定', sum.parts.tempo, w.tempo, '#6C8FB3']
      ];
    },

    result(sum, prev, profile) {
      const firstMax = profile && profile.firstMax;
      let chip = '';
      if (firstMax && sum.maxAngle - firstMax >= 1) chip = '手臂最高 ' + sum.maxAngle + '°，比第一次多了 ' + (sum.maxAngle - firstMax) + '°';
      else if (prev && sum.maxAngle - prev.maxAngle >= 1) chip = '手臂最高 ' + sum.maxAngle + '°，比上次高了 ' + (sum.maxAngle - prev.maxAngle) + '°';
      else chip = '手臂最高 ' + sum.maxAngle + '°，繼續保持！';
      const small = sum.reps - sum.picked;
      return {
        sub: '今天摘到 ' + sum.picked + ' 顆蘋果' + (small > 0 ? '，撿到 ' + small + ' 顆小蘋果' : ''),
        chip,
        speech: '今天摘到 ' + sum.picked + ' 顆蘋果'
      };
    },

    perfText: s => (s.reps && s.maxAngle ? '最高 ' + s.maxAngle + '°' : '—'),
    profileNote: p => (p && p.target
      ? '摘果子目標：' + p.target + '°（第一次最高 ' + p.firstMax + '°）'
      : '摘果子：第一次玩會先做 3 下能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '籃子',
      steps: [
        {
          label: '怎麼玩',
          title: '側身坐好，把手往前舉高',
          caption: '側身坐好 → 手臂伸直，慢慢往前舉高',
          html:
            '<p>坐在椅子上，身體轉向側面，讓要舉的那隻手靠近鏡頭。</p>' +
            '<p>手臂伸直，<b>慢慢</b>往前、往上舉，再慢慢放下來，這樣算 1 下。</p>',
          voice: '歡迎來玩摘果子！請側身坐在椅子上，讓要舉的手靠近鏡頭。手臂伸直，慢慢往前、往上舉高，再慢慢放下來，這樣算一下。'
        },
        {
          label: '摘蘋果',
          title: '舉到蘋果，撐住 2 秒',
          caption: '黃色圈圈跑滿，蘋果就掉進籃子',
          html:
            '<p>蘋果會掛在適合您的高度。手舉到蘋果旁邊，<b>撐住約 2 秒</b>，等黃色圈圈跑滿，蘋果就會掉進籃子。</p>' +
            '<p>沒摘到也沒關係，會掉一顆小蘋果，一樣算數。</p>',
          voice: '蘋果會掛在適合您的高度。手舉到蘋果旁邊，撐住大約兩秒，等黃色圈圈跑滿，蘋果就會掉進籃子。沒摘到也沒關係，會掉一顆小蘋果，一樣算數。'
        },
        {
          label: '計分',
          title: '每一下都會打分數',
          caption: '每做完一下，就會算出分數',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>舉得夠高</b>到達目標高度</span><em>40 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>姿勢正確</b>手肘伸直、身體坐正、肩膀放鬆</span><em>30 分</em></li>' +
            '<li><i style="background:#E0A126"></i><span><b>撐得夠久</b>在蘋果旁邊撐 2 秒</span><em>20 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>速度平穩</b>不要甩，也不用太慢</span><em>10 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">一共做 10 下。第一次玩會先做 3 下「能力測量」，幫您設定合適的目標。</p>',
          voice: '每一下都會打分數。舉得夠高、姿勢正確、撐得夠久、速度平穩，加起來一百分。一共做十下。第一次玩，會先做三下能力測量，幫您設定合適的目標。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '會痛就按紅色按鈕，馬上停止',
          html:
            '<ul class="tut-safety">' +
            '<li>坐在<b>穩固、沒有輪子</b>的椅子上</li>' +
            '<li>慢慢做，<b>不用勉強</b>，舉到不痛的高度就好</li>' +
            '<li>會痛、頭暈或喘不過氣，馬上按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '<li>剛吃飽或身體不舒服時，先休息</li>' +
            '<li>最好有家人在旁邊陪伴</li>' +
            '</ul>',
          voice: '最後是注意事項。請坐在穩固、沒有輪子的椅子上。慢慢做，不用勉強，舉到不痛的高度就好。如果會痛、頭暈或喘不過氣，請馬上按紅色的會痛就按這裡。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：虛擬長輩一直摘蘋果
      makeSim(canvas, basket) {
        const TARGET = 140;
        const scene = new RCDD.AppleScene(canvas);
        const demo = new RCDD.DemoPose();
        demo.peaks = [150, 148, 152];
        demo.bendReps = new Set();
        demo.leanReps = new Set();
        demo.start(performance.now(), 0);
        const fx = new EX.FeatureExtractor();
        const smoother = new RCDD.geo.LandmarkSmoother(0.5);
        const tracker = new EX.RepTracker(cfg, TARGET);
        let picked = 0;
        const basketPoint = () => {
          const b = basket.getBoundingClientRect(), c = canvas.getBoundingClientRect();
          return { x: b.left - c.left + 12 + basket.children.length * 28, y: b.top - c.top + 14 };
        };
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'picked') {
                picked++;
                RCDD.voice.sfx.pick();
                if (basket.children.length >= 8) basket.innerHTML = '';
                scene.launchApple(basketPoint(), false, () => basket.appendChild(document.createElement('i')));
              } else if (e.type === 'rep') {
                scene.floatText('+' + e.score.total + ' 分');
              }
            }
            const cur = tracker.current;
            scene.draw({
              source: demo, feat: f, mode: 'game', target: TARGET,
              holdProgress: cur.holdProgress, reached: cur.reached, repPicked: cur.picked,
              picked: picked % 10, now
            });
          }
        };
      }
    }
  };
})(window);
