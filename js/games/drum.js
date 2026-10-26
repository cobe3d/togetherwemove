// 遊戲定義：打鼓（跨體拍肩）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const D = RCDD.drum;
  const cfg = RCDD.exercises['cross-tap'];
  const HAND = { L: '左手', R: '右手' };
  const TARGET_SIDE = { R: '左邊', L: '右邊' };
  const cueText = h => HAND[h] + '拍' + TARGET_SIDE[h] + '肩膀';
  const both = f => !!(f && f.visible && f.hands.L.rest && f.hands.R.rest);

  RCDD.games.drum = {
    id: 'drum',
    name: '打鼓',
    motion: '跨體拍肩',
    cfg,
    seenKey: 'tutorialSeen.drum',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      { id: 'body', label: '看得到頭和兩邊肩膀', hint: '請坐到鏡頭正前方，讓我看到您的頭和兩邊肩膀', test: f => !!(f && f.visible) },
      { id: 'front', label: '正面坐好', hint: '請把身體轉正，面對螢幕', test: f => !!(f && f.visible && f.frontal) },
      {
        id: 'dist', label: '距離剛好',
        hint: (f, S) => (f && f.sw / S.source.width > 0.42 ? '有點太近了，請往後坐一點' : '有點太遠了，請往前坐一點'),
        test: (f, S) => !!(f && f.visible && f.sw / S.source.width > 0.1 && f.sw / S.source.width < 0.42)
      },
      { id: 'ready', label: '雙手放在大腿上', hint: '請先把兩隻手放在大腿上', test: both }
    ],
    checkVoice: '請正面坐好，讓我看到您的頭和兩邊肩膀',

    newScene: canvas => new RCDD.DrumScene(canvas),
    newExtractor: () => new D.DrumFeatureExtractor(cfg),
    newDemo: () => new RCDD.DemoDrumPose(),

    newTracker({ calibrating, profile, baseline }) {
      return new D.TapTracker(cfg, { calibrating, touch: profile && profile.touch, baseline });
    },

    calibIntro: ['先左右各拍 2 下，讓我認識您的手。看到鼓亮起來，就用箭頭指的那隻手，輕輕拍對面的肩膀，再放回大腿。', '先左右各拍 2 下'],
    onCalibEvent(e, ctx) {
      if (e.type === 'cue') ctx.bubble(cueText(e.hand));
      else if (e.type === 'hit') { RCDD.music.drum(e.hand); ctx.scene.hit(e.hand); }
      else if (e.type === 'wrong') ctx.say('換另一隻手，用' + HAND[ctx.S.tracker.cue] + '拍', 2);
    },
    onCalibRep(e, ctx) {
      if (!e.rep.hit) { RCDD.music.drum(e.rep.hand, true); ctx.scene.hit(e.rep.hand, true); }
      return e.rep.minD;
    },
    calibRepSay(e, n) {
      return ['很好，換' + HAND[e.next], '很好！換' + HAND[e.next]];
    },
    finishCalibration(values, old) {
      const touch = D.computeTouch(values, cfg);
      const wide = touch > cfg.minTouch;
      return {
        profile: { touch, firstTouch: old && old.firstTouch ? old.firstTouch : touch, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: wide ? '已經幫您放寬範圍：\n手碰到上臂附近就算拍到' : '您的手可以碰到肩膀，很好！',
        voice: (wide ? '測量完成！已經幫您放寬範圍，手碰到上臂附近就算拍到。' : '測量完成！您的手可以碰到肩膀，很好！') + '我們開始打鼓，一起彈出兩隻老虎吧！',
        button: '開始打鼓'
      };
    },
    hasProfile: p => !!(p && p.touch),

    gameIntro: ['跟著亮起的鼓，左右交替拍肩膀。每拍到一下，就會彈出一句兩隻老虎。', '看鼓亮起，左右交替拍肩'],
    onStartGame(ctx) { ctx.S.combo = 0; ctx.S.phraseIdx = 0; },

    onEvent(e, ctx) {
      const S = ctx.S;
      if (e.type === 'cue') {
        ctx.bubble(cueText(e.hand), true);
        if (S.scores.length === 0) ctx.voice.speak(cueText(e.hand), 1);
        else ctx.voice.speak('換' + HAND[e.hand], 1);
      } else if (e.type === 'hit') {
        RCDD.music.drum(e.hand);
        RCDD.music.playPhrase(S.phraseIdx++, S.tracker.interval * 0.95);
        ctx.scene.hit(e.hand);
        S.combo++;
        ctx.addBasket('note');
        ctx.bubble('咚！很好', true);
        if (S.combo >= 3 && S.combo % 3 === 0) {
          const pos = ctx.scene.drumPos[e.hand === 'R' ? 'LS' : 'RS'];
          ctx.scene.floatText('連擊 ' + S.combo + ' 下！', pos ? { x: pos.x, y: pos.y - pos.r } : null);
        }
      } else if (e.type === 'miss') {
        ctx.say('再靠近肩膀一點', 2);
      } else if (e.type === 'wrong') {
        ctx.say('換另一隻手，用' + HAND[S.tracker.cue] + '拍', 2);
      }
    },

    onRep(e, ctx) {
      const S = ctx.S;
      if (!e.score.hit) {
        // 差一點沒拍到也算數：小聲的鼓，歌一樣往下彈
        RCDD.music.drum(e.rep.hand, true);
        RCDD.music.playPhrase(S.phraseIdx++, S.tracker.interval * 0.95, 0.7);
        ctx.scene.hit(e.rep.hand, true);
        S.combo = 0;
        ctx.addBasket('note small');
        if (!e.score.faultVoice) ctx.say('很好，下一下再靠近肩膀一點', 2);
      }
      if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      else if (S.scores.length === cfg.reps / 2 && e.score.hit) ctx.say('已經做一半了，很棒！', 2);
    },

    drawParams(S) {
      const cur = S.tracker ? S.tracker.current : null;
      return { cue: cur ? cur.cue : 'R', phase: cur ? cur.phase : 'cue', glow: cur ? cur.glow : 0 };
    },

    updateHud(S, $) {
      $('comboNow').textContent = S.phase === 'game' ? (S.combo || 0) : '—';
    },

    summarize: scores => D.summarizeDrum(scores, cfg),
    record: sum => ({ hits: sum.hits, maxCombo: sum.maxCombo, onBeat: sum.onBeat, avgReaction: sum.avgReaction }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['拍到位置', sum.parts.reach, w.reach, '#2E6B4E'],
        ['身體穩定', sum.parts.form, w.form, '#4C9C62'],
        ['跟上節拍', sum.parts.timing, w.timing, '#E0A126'],
        ['左右交替', sum.parts.alternate, w.alternate, '#6C8FB3']
      ];
    },

    result(sum) {
      return {
        sub: '今天打了 ' + sum.reps + ' 下鼓，最長連擊 ' + sum.maxCombo + ' 下',
        chip: '跟上節拍 ' + sum.onBeat + '%，平均 ' + sum.avgReaction + ' 秒拍一下',
        speech: '今天打了 ' + sum.reps + ' 下鼓，最長連擊 ' + sum.maxCombo + ' 下'
      };
    },

    perfText: s => (s.reps && s.hits != null ? '拍到 ' + s.hits + '/' + s.reps : '—'),
    profileNote: p => (p && p.touch
      ? '打鼓判定：' + (p.touch <= cfg.minTouch ? '碰到肩膀' : '碰到上臂附近')
      : '打鼓：第一次玩會先左右各拍 2 下能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '拍到',
      steps: [
        {
          label: '怎麼玩',
          title: '正面坐好，交叉拍肩膀',
          caption: '右手拍左肩 → 放下 → 左手拍右肩',
          html:
            '<p>坐在椅子上，<b>正面</b>對著鏡頭，兩手放在大腿上。</p>' +
            '<p>右手越過身體，<b>輕輕</b>拍左邊肩膀，再放回大腿；接著換左手拍右邊肩膀。左右交替。</p>',
          voice: '歡迎來玩打鼓！請正面坐在椅子上，兩手放在大腿上。右手越過身體，輕輕拍左邊肩膀，再放回大腿。接著換左手拍右邊肩膀，左右交替。'
        },
        {
          label: '打鼓',
          title: '亮起的鼓，就是要拍的那邊',
          caption: '拍到鼓，就會彈出一句〈兩隻老虎〉',
          html:
            '<p>兩邊肩膀各有一面鼓。<b>黃色亮起</b>的那面就是現在要拍的，箭頭會告訴您用哪隻手。</p>' +
            '<p>每拍到一下，就會彈出一句〈兩隻老虎〉。跟著拍，就能把整首歌彈出來。</p>',
          voice: '兩邊肩膀各有一面鼓。黃色亮起的那面，就是現在要拍的，箭頭會告訴您用哪隻手。每拍到一下，就會彈出一句兩隻老虎。跟著拍，就能把整首歌彈出來。'
        },
        {
          label: '計分',
          title: '每一下都會打分數',
          caption: '每拍完一下，就會算出分數',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>拍到位置</b>手碰到對面的肩膀</span><em>40 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>身體穩定</b>身體不轉、不歪，不要低頭去碰</span><em>30 分</em></li>' +
            '<li><i style="background:#E0A126"></i><span><b>跟上節拍</b>鼓亮起後拍到，速度會跟著您調整</span><em>20 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>左右交替</b>照順序換手</span><em>10 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">一共 12 下，左右各 6 下。第一次玩會先左右各拍 2 下「能力測量」。</p>',
          voice: '每一下都會打分數。拍到位置、身體穩定、跟上節拍、左右交替，加起來一百分。一共十二下。第一次玩，會先左右各拍兩下能力測量。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '輕輕碰到就好，會痛就按紅色按鈕',
          html:
            '<ul class="tut-safety">' +
            '<li><b>輕輕碰到</b>肩膀就好，不要用力拍打</li>' +
            '<li>肩膀會痛時，舉到<b>不痛的位置</b>就好</li>' +
            '<li>會痛、頭暈或喘不過氣，馬上按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '<li>坐在穩固、沒有輪子的椅子上</li>' +
            '<li>最好有家人在旁邊陪伴</li>' +
            '</ul>',
          voice: '最後是注意事項。輕輕碰到肩膀就好，不要用力拍打。肩膀會痛時，舉到不痛的位置就好。如果會痛、頭暈或喘不過氣，請馬上按紅色的會痛就按這裡。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：虛擬長輩左右交替打鼓
      makeSim(canvas, basket) {
        const scene = new RCDD.DrumScene(canvas);
        const demo = new RCDD.DemoDrumPose();
        demo.headDropReps = new Set();
        demo.tiltReps = new Set();
        demo.shortReps = new Set();
        demo.start(performance.now(), 0);
        const fx = new D.DrumFeatureExtractor(cfg);
        const smoother = new RCDD.geo.LandmarkSmoother(0.5);
        const tracker = new D.TapTracker(cfg, { touch: cfg.defaultTouch });
        let phrase = 0;
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'hit') {
                RCDD.music.drum(e.hand);
                RCDD.music.playPhrase(phrase++, 2.8, 0.45);
                scene.hit(e.hand);
                if (basket.children.length >= 8) basket.innerHTML = '';
                const i = document.createElement('i');
                i.className = 'note';
                basket.appendChild(i);
              } else if (e.type === 'rep') {
                scene.floatText('+' + e.score.total + ' 分');
              }
            }
            const cur = tracker.current;
            scene.draw({ source: demo, feat: f, mode: 'game', cue: cur.cue, phase: cur.phase, glow: cur.glow, now });
          }
        };
      }
    }
  };
})(window);
