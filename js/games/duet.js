// 遊戲定義：雙手聯彈（雙手手指彎曲；左右手彎下都彈旋律，和弦自動伴奏）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const DU = RCDD.duet;
  const cfg = RCDD.exercises['finger-bend'];
  const NAME = { T: '拇指', I: '食指', M: '中指', R: '無名指', P: '小指' };
  const HAND = { L: '左手', R: '右手' };
  const stepText = s => HAND[s.hand] + NAME[s.f];
  const allOpen = f => !!(f && ['L', 'R'].every(h => cfg.fingers.every(k => f.hands[h].bend[k] < cfg.straight)));

  // 左手或右手彎下：旋律往下一個音，和弦自動跟著伴奏
  function playBend(S, scene, hand, finger, vol) {
    S.noteIdx = S.noteIdx || 0;   // 能力測量時還沒開始計算旋律位置
    const res = RCDD.music.duetNote(S.noteIdx, vol);
    S.noteIdx++;
    scene.pressDuet(res, finger);
  }

  RCDD.games.duet = {
    id: 'duet',
    name: '雙手聯彈',
    motion: '雙手手指彎曲',
    cfg,
    detector: 'hand2',
    unit: '回',
    seenKey: 'tutorialSeen.duet2',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      { id: 'hands', label: '看得到兩隻手', hint: '請把兩隻手都舉到鏡頭前', test: f => !!f },
      { id: 'up', label: '手指朝上、掌心朝前', hint: '請把手指朝上，掌心對著螢幕', test: f => !!(f && f.upright) },
      {
        id: 'dist', label: '距離剛好',
        hint: (f, S) => (f && f.palm / S.source.height > 0.4 ? '手有點太近了，請往後一點' : '手有點太遠了，請靠近鏡頭一點'),
        test: (f, S) => !!(f && f.palm / S.source.height > 0.08 && f.palm / S.source.height < 0.4)
      },
      { id: 'open', label: '五指張開', hint: '請把兩隻手的手指都張開', test: allOpen }
    ],
    checkVoice: '請把兩隻手舉到鏡頭前，手肘靠在桌上，張開手掌，掌心對著螢幕',

    newScene: canvas => new RCDD.DuetScene(canvas),
    newExtractor: () => new DU.DuetFeatureExtractor(),
    newDemo: () => new RCDD.DemoDuetPose(),

    newTracker({ calibrating, profile }) {
      return new DU.BendTracker(cfg, { calibrating, thr: profile && profile.thr });
    },

    calibIntro: ['先做 1 回，讓我認識您的手指。看亮起來的那隻手指，把它慢慢往下彎，再伸直回來。左手右手輪流。', '先做 1 回：彎下亮起的手指'],
    onCalibEvent(e, ctx) {
      if (e.type === 'bend') playBend(ctx.S, ctx.scene, e.hand, e.finger, 0.8);
      else if (e.type === 'next') ctx.bubble('很好！下一個：' + stepText(e.step));
    },
    onCalibRep(e) {
      return Object.values(e.score.perFinger);
    },
    calibRepSay() {
      return ['很好', '很好！'];
    },
    finishCalibration(values, old) {
      const thr = DU.computeThr([].concat(...values), cfg);
      const wide = thr < cfg.maxThr;
      return {
        profile: { thr, firstThr: old && old.firstThr ? old.firstThr : thr, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: wide ? '已經幫您放寬範圍：\n手指彎一半就算' : '您的手指都彎得下去，很好！',
        voice: (wide ? '測量完成！已經幫您放寬範圍，手指彎一半就算。' : '測量完成！您的手指都彎得下去，很好！') + '兩手輪流彈旋律，和弦會自動伴奏，我們一起彈小星星吧！',
        button: '開始聯彈'
      };
    },
    hasProfile: p => !!(p && p.thr),

    gameIntro: ['我們開始雙手聯彈！看亮起來的那隻手指，把它往下彎，再伸直回來。每彎一下就彈出一個音，和弦會自動伴奏。', '看亮起的手指，彎下再伸直'],
    onStartGame(ctx) { ctx.S.noteIdx = 0; },

    onEvent(e, ctx) {
      const S = ctx.S;
      if (e.type === 'bend') {
        playBend(S, ctx.scene, e.hand, e.finger);
        ctx.bubble('很好！伸直回來', true);
      } else if (e.type === 'next') {
        ctx.bubble('下一個：' + stepText(e.step), true);
      } else if (e.type === 'wrong') {
        ctx.say('不是這隻喔，請彎' + stepText(e.expect), 2);
      } else if (e.type === 'wrongHand') {
        ctx.say('換另一隻手，請彎' + stepText(e.expect), 2);
      }
    },

    onRep(e, ctx) {
      const S = ctx.S;
      const n = S.scores.length;
      ctx.scene.floatText('+1 回', ctx.scene.tipPos);
      if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      else if (n < cfg.reps) ctx.bubble('完成 1 回！繼續', true);
      if (n === cfg.reps) {
        // 最後自動把〈小星星〉彈完，再彈一個收尾和弦
        S.finaleMs = RCDD.music.duetFinish(S.noteIdx, res => ctx.scene.pressDuet(res, 'M'));
        S.noteIdx = 0;
        ctx.bubble('一起把歌彈完！', true);
      }
    },

    drawParams(S) {
      const tr = S.tracker;
      const cur = tr ? tr.current : null;
      return { step: cur ? cur.step : null, phase: cur ? cur.phase : 'wait', thr: tr ? tr.thr : cfg.defaultThr };
    },

    updateHud(S, $) {
      const tr = S.tracker;
      const cur = tr.current;
      $('handLbl').textContent = cur.phase === 'release' ? '伸直回來' : '現在彎';
      $('handNow').textContent = stepText(cur.step);
      const fi = Math.floor(cur.idx / 2);
      const html = cfg.sequence.map((k, i) => '<i style="--c:' + RCDD.FINGER_COLOR[k] + '" class="' +
        (i < fi ? 'done' : i === fi ? 'now' : '') + '">' + NAME[k][0] + '</i>').join('');
      if ($('seqDots').innerHTML !== html) $('seqDots').innerHTML = html;
    },

    summarize: scores => DU.summarizeDuet(scores, cfg),
    record: sum => ({ bends: sum.bends, hardest: sum.hardest }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['彎對手指', sum.parts.correct, w.correct, '#2E6B4E'],
        ['其他手指伸直', sum.parts.indep, w.indep, '#4C9C62'],
        ['彎得夠深', sum.parts.depth, w.depth, '#E0A126'],
        ['節奏平穩', sum.parts.tempo, w.tempo, '#6C8FB3']
      ];
    },

    result(sum) {
      const h = sum.hardest;
      return {
        sub: '今天兩手一共彎了 ' + sum.bends + ' 下' + (sum.reps >= cfg.reps ? '，彈了 ' + Math.ceil(sum.bends / RCDD.music.SONG.length) + ' 遍〈小星星〉' : ''),
        chip: h ? '最難彎的是' + HAND[h[0]] + NAME[h[1]] : '每隻手指都彎得很好',
        speech: '今天兩手一共彎了 ' + sum.bends + ' 下'
      };
    },

    perfText: s => (s.reps && s.bends != null ? '彎 ' + s.bends + ' 下' : '—'),
    profileNote: p => (p && p.thr
      ? '雙手聯彈判定：' + (p.thr < cfg.maxThr ? '手指彎一半就算' : '手指彎下去')
      : '雙手聯彈：第一次玩會先做 1 回能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '彈出的音',
      steps: [
        {
          label: '怎麼玩',
          title: '張開雙手，彎下亮起的手指',
          caption: '彎下 → 伸直；左手、右手輪流',
          html:
            '<p>坐在桌前，<b>手肘靠在桌上</b>，兩手舉到鏡頭前，張開手掌、<b>掌心對著鏡頭</b>。</p>' +
            '<p>看亮起來的那隻手指，把它<b>慢慢往下彎</b>，再伸直回來。先左手、再右手，從拇指一路到小指，再回到拇指。</p>',
          voice: '歡迎來玩雙手聯彈！請坐在桌前，手肘靠在桌上，兩手舉到鏡頭前，張開手掌，掌心對著鏡頭。看亮起來的那隻手指，把它慢慢往下彎，再伸直回來。先左手、再右手，從拇指一路到小指，再回到拇指。'
        },
        {
          label: '聯彈',
          title: '兩手輪流彈旋律，和弦自動伴奏',
          caption: '每彎一下，就彈出〈小星星〉的一個音',
          html:
            '<p>不管左手還是右手，<b>每彎一下</b>就會彈出〈小星星〉的一個音。左右手輪流，就是兩手一起彈琴；<b>和弦會自動伴奏</b>。</p>' +
            '<p>下面的琴鍵會亮兩種顏色：彩色是旋律，藍色是和弦。做完 4 回，可以把〈小星星〉彈兩遍。</p>',
          voice: '不管左手還是右手，每彎一下，就會彈出小星星的一個音。左右手輪流，就是兩手一起彈琴，和弦會自動伴奏。下面的琴鍵，彩色是旋律，藍色是和弦。做完四回，可以把小星星彈兩遍。'
        },
        {
          label: '計分',
          title: '每一回都會打分數',
          caption: '左右手各 9 下，算 1 回',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>彎對手指</b>彎下亮起來的那一隻</span><em>40 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>其他手指伸直</b>旁邊的手指不要跟著彎到底</span><em>30 分</em></li>' +
            '<li><i style="background:#E0A126"></i><span><b>彎得夠深</b>依您的能力，彎到目標</span><em>20 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>節奏平穩</b>不要太快，也不用太慢</span><em>10 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">第一次玩會先做 1 回「能力測量」；手指彎不太下去的話，會幫您放寬範圍。</p>',
          voice: '每一回都會打分數。彎對手指、其他手指伸直、彎得夠深、節奏平穩，加起來一百分。第一次玩，會先做一回能力測量。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '慢慢彎、慢慢伸直，會痛就按紅色按鈕',
          html:
            '<ul class="tut-safety">' +
            '<li>慢慢彎、慢慢伸直，<b>不用彎到底</b></li>' +
            '<li>手指會痛或很僵硬時，做到<b>能做的程度</b>就好</li>' +
            '<li>手痠了可以把手放下休息，遊戲會等您</li>' +
            '<li>會痛就按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '</ul>',
          voice: '最後是注意事項。慢慢彎、慢慢伸直，不用彎到底。手指會痛或很僵硬時，做到能做的程度就好。手痠了可以把手放下休息，遊戲會等您。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：兩隻手輪流彎手指，彈出旋律，和弦自動伴奏
      makeSim(canvas, basket) {
        const scene = new RCDD.DuetScene(canvas);
        scene.kbBottom = 150;
        const demo = new RCDD.DemoDuetPose();
        demo.wrongRounds = new Set();
        demo.sloppyRounds = new Set();
        demo.start(performance.now(), 0);
        const fx = new DU.DuetFeatureExtractor();
        const smoother = new RCDD.geo.LandmarkSmoother(0.6);
        const tracker = new DU.BendTracker(cfg, { thr: cfg.defaultThr });
        const S = { noteIdx: 0 };
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'bend') {
                playBend(S, scene, e.hand, e.finger, 0.5);
                if (basket.children.length >= 8) basket.innerHTML = '';
                const i = document.createElement('i');
                i.className = 'note';
                basket.appendChild(i);
              } else if (e.type === 'rep') {
                scene.floatText('+1 回', scene.tipPos);
              }
            }
            const cur = tracker.current;
            scene.draw({ source: demo, feat: f, mode: 'game', step: cur.step, phase: cur.phase, thr: tracker.thr, now });
          }
        };
      }
    }
  };
})(window);
