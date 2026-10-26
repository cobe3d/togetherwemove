// 遊戲定義：彈鋼琴（手指對指）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const PN = RCDD.piano;
  const cfg = RCDD.exercises['finger-opposition'];
  const NAME = PN.NAME;
  const HAND = { L: '左手', R: '右手' };
  const allOpen = f => !!(f && PN.FINGERS.every(k => f.d[k] > cfg.open));

  function playNext(S, scene, finger, vol) {
    const song = RCDD.music.SONG;
    S.noteIdx = S.noteIdx || 0;   // 能力測量時還沒開始計算旋律位置
    const note = song[S.noteIdx % song.length];
    S.noteIdx++;
    RCDD.music.piano(note, vol);
    scene.press(note, finger, RCDD.music.SOLFA[note]);
  }

  RCDD.games.piano = {
    id: 'piano',
    name: '彈鋼琴',
    motion: '手指對指',
    cfg,
    detector: 'hand',
    unit: '回',
    seenKey: 'tutorialSeen.piano',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      { id: 'hand', label: '看得到整隻手', hint: '請把右手舉到鏡頭前，讓我看到整隻手', test: f => !!f },
      { id: 'up', label: '手指朝上，手掌對著鏡頭', hint: '請把手指朝上，手掌對著螢幕', test: f => !!(f && f.upright) },
      {
        id: 'dist', label: '距離剛好',
        hint: (f, S) => (f && f.palm / S.source.height > 0.42 ? '手有點太近了，請往後一點' : '手有點太遠了，請靠近鏡頭一點'),
        test: (f, S) => !!(f && f.palm / S.source.height > 0.12 && f.palm / S.source.height < 0.42)
      },
      { id: 'open', label: '手張開，準備好', hint: '請先把手張開', test: allOpen }
    ],
    checkVoice: '請把右手舉到鏡頭前，手肘靠在桌上，手掌對著螢幕',

    newScene: canvas => new RCDD.PianoScene(canvas),
    newExtractor: () => new PN.HandFeatureExtractor(),
    newDemo: () => new RCDD.DemoHandPose(),

    newTracker({ calibrating, profile }) {
      return new PN.FingerTracker(cfg, {
        calibrating,
        touch: profile && profile.touch,
        // 能力測量走單向；遊戲固定來回：食指 → 小指 → 食指
        sequence: calibrating ? cfg.sequences.oneway : cfg.sequences.roundtrip
      });
    },

    calibIntro: ['先用右手做 2 回，讓我認識您的手指。看亮起來的手指，用拇指輕輕碰它的指尖。', '右手先做 2 回'],
    onCalibEvent(e, ctx) {
      if (e.type === 'touch') {
        playNext(ctx.S, ctx.scene, e.finger, 0.8);
        ctx.bubble('很好！下一隻：' + NAME[ctx.S.tracker.current.target]);
      } else if (e.type === 'wrong') {
        ctx.say('不是這隻喔，請碰' + NAME[e.expect], 2);
      }
    },
    onCalibRep(e) {
      RCDD.music.pianoChord();
      return Math.max(...Object.values(e.score.perFinger));
    },
    calibRepSay() {
      return ['很好，再一回', '很好！再一回'];
    },
    finishCalibration(values, old) {
      const touch = PN.computeTouch(values, cfg);
      const wide = touch > 0.3;
      return {
        profile: { touch, firstTouch: old && old.firstTouch ? old.firstTouch : touch, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: wide ? '已經幫您放寬範圍：\n拇指碰到指腹附近就算' : '您的手指都碰得到，很好！',
        voice: (wide ? '測量完成！已經幫您放寬範圍，拇指碰到指腹附近就算。' : '測量完成！您的手指都碰得到，很好！') + '我們開始彈小星星吧！',
        button: '開始彈琴'
      };
    },
    hasProfile: p => !!(p && p.touch),

    gameIntro: ['我們開始彈琴吧！先用右手，看亮起來的手指，用拇指輕輕碰它。每碰一下，就會彈出一個音。', '右手：看亮起的手指，用拇指碰'],
    onStartGame(ctx) {
      const S = ctx.S;
      S.hand = 'R';
      S.noteIdx = 0;
      S.source.prefer = 'R';
      if (S.source.isDemo) S.source.sequence = cfg.sequences.roundtrip;
    },

    onEvent(e, ctx) {
      const S = ctx.S;
      if (e.type === 'touch') {
        playNext(S, ctx.scene, e.finger);
        const cur = S.tracker.current;
        ctx.bubble(cur.pending ? '很好！放開手指' : '很好！下一隻：' + NAME[cur.target], true);
      } else if (e.type === 'wrong') {
        ctx.say('不是這隻喔，請碰' + NAME[e.expect], 2);
      }
    },

    onRep(e, ctx) {
      const S = ctx.S;
      e.score.hand = S.hand;
      RCDD.music.pianoChord();
      ctx.scene.floatText('+1 回', ctx.scene.thumbPos);
      const n = S.scores.length;
      if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      if (n === cfg.roundsPerHand) {
        // 右手做完，休息後換左手
        ctx.rest(cfg.restSeconds, '右手完成了！', '甩一甩手，休息一下。\n接下來換左手。', () => {
          S.hand = 'L';
          S.source.prefer = 'L';
          S.tracker.reset();
          if (S.source.isDemo) S.source.start(performance.now(), cfg.calibrationReps + n);
          ctx.say('換左手，把左手舉到鏡頭前，手掌對著螢幕', 2, '換左手：看亮起的手指');
        });
        ctx.voice.speak('右手完成了！甩一甩手，休息十秒，接下來換左手。', 3);
      } else if (!e.score.faultVoice && n < cfg.reps) {
        ctx.bubble('完成 1 回！繼續', true);
      }
      if (n === cfg.reps) {
        // 最後自動把〈小星星〉剩下的音彈完
        S.finaleMs = RCDD.music.pianoFinish(S.noteIdx, note => ctx.scene.press(note, 'M', RCDD.music.SOLFA[note]));
        S.noteIdx = 0;
      }
    },

    drawParams(S) {
      const cur = S.tracker ? S.tracker.current : null;
      return { target: cur ? cur.target : 'I', contact: cur ? cur.contact : null, pending: cur ? cur.pending : false };
    },

    updateHud(S, $) {
      $('handLbl').textContent = '現在用';
      $('handNow').textContent = HAND[S.phase === 'calibrate' ? 'R' : (S.hand || 'R')];
      const tr = S.tracker;
      const seq = tr.sequence;
      const html = seq.map((k, i) => '<i style="--c:' + RCDD.FINGER_COLOR[k] + '" class="' +
        (i < tr.idx ? 'done' : i === tr.idx && !tr.pendingRound ? 'now' : '') + '">' + NAME[k][0] + '</i>').join('');
      if ($('seqDots').innerHTML !== html) $('seqDots').innerHTML = html;
    },

    summarize: scores => PN.summarizePiano(scores, cfg),
    record: sum => ({ notes: sum.notes, right: sum.right, left: sum.left, hardest: sum.hardest }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['碰得確實', sum.parts.reach, w.reach, '#2E6B4E'],
        ['順序正確', sum.parts.order, w.order, '#4C9C62'],
        ['手指張開', sum.parts.open, w.open, '#E0A126'],
        ['速度平穩', sum.parts.tempo, w.tempo, '#6C8FB3']
      ];
    },

    result(sum) {
      const hands = [];
      if (sum.right != null) hands.push('右手 ' + sum.right + ' 分');
      if (sum.left != null) hands.push('左手 ' + sum.left + ' 分');
      return {
        sub: '今天彈了 ' + sum.notes + ' 個音',
        chip: hands.join('、') + (sum.hardest ? '，最難碰的是' + NAME[sum.hardest] : ''),
        speech: '今天彈了 ' + sum.notes + ' 個音'
      };
    },

    perfText: s => (s.reps && s.notes != null ? '彈 ' + s.notes + ' 個音' : '—'),
    profileNote: p => (p && p.touch
      ? '彈鋼琴判定：' + (p.touch > 0.3 ? '碰到指腹附近' : '碰到指尖')
      : '彈鋼琴：第一次玩會先用右手做 2 回能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '彈出的音',
      steps: [
        {
          label: '怎麼玩',
          title: '手掌對著鏡頭，拇指碰指尖',
          caption: '拇指依序碰：食指 → 小指 → 再回到食指',
          html:
            '<p>坐在桌前，<b>手肘靠在桌上</b>，把手舉到鏡頭前，手掌對著螢幕。</p>' +
            '<p>用拇指依序<b>輕輕</b>碰食指、中指、無名指、小指的指尖，<b>再倒回來</b>碰無名指、中指、食指。每碰一下，手指要張開，再碰下一隻。</p>',
          voice: '歡迎來玩彈鋼琴！請坐在桌前，手肘靠在桌上，把手舉到鏡頭前，手掌對著螢幕。用拇指依序輕輕碰食指、中指、無名指、小指的指尖，再倒回來碰無名指、中指、食指。每碰一下，手指要張開，再碰下一隻。'
        },
        {
          label: '彈琴',
          title: '亮起的手指，就是下一個要碰的',
          caption: '每碰一下，就彈出一個〈小星星〉的音',
          html:
            '<p>下一隻要碰的指尖會<b>亮起來</b>。碰到就會彈出一個音，下面的琴鍵也會亮。</p>' +
            '<p>先右手 5 回，休息一下，再換左手 5 回，就能彈出〈小星星〉。</p>',
          voice: '下一隻要碰的指尖會亮起來。碰到就會彈出一個音，下面的琴鍵也會亮。先右手五回，休息一下，再換左手五回，就能彈出小星星。'
        },
        {
          label: '計分',
          title: '每一回都會打分數',
          caption: '食指到小指、再回到食指，算 1 回',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>碰得確實</b>拇指碰到指尖</span><em>40 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>順序正確</b>照亮起的手指碰</span><em>30 分</em></li>' +
            '<li><i style="background:#E0A126"></i><span><b>手指張開</b>每碰完一下要張開</span><em>20 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>速度平穩</b>不要太快，也不用太慢</span><em>10 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">第一次玩會先用右手做 2 回「能力測量」；手指碰不到的話，會幫您放寬範圍。</p>',
          voice: '每一回都會打分數。碰得確實、順序正確、手指張開、速度平穩，加起來一百分。第一次玩，會先用右手做兩回能力測量。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '輕輕碰到就好，會痛就按紅色按鈕',
          html:
            '<ul class="tut-safety">' +
            '<li><b>輕輕碰到</b>就好，不要用力捏</li>' +
            '<li>手指僵硬或會痛時，做到<b>能做的程度</b>就好</li>' +
            '<li>手痠了可以把手放下休息，遊戲會等您</li>' +
            '<li>會痛就按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '</ul>',
          voice: '最後是注意事項。輕輕碰到就好，不要用力捏。手指僵硬或會痛時，做到能做的程度就好。手痠了可以把手放下休息，遊戲會等您。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：虛擬的手依序對指，一邊彈出〈小星星〉
      makeSim(canvas, basket) {
        const scene = new RCDD.PianoScene(canvas);
        scene.kbBottom = 150;
        const demo = new RCDD.DemoHandPose();
        demo.wrongRounds = new Set();
        demo.lazyRounds = new Set();
        demo.start(performance.now(), 0);
        const fx = new PN.HandFeatureExtractor();
        const smoother = new RCDD.geo.LandmarkSmoother(0.6);
        demo.calibRounds = 0;
        demo.sequence = cfg.sequences.roundtrip;
        const tracker = new PN.FingerTracker(cfg, { touch: cfg.defaultTouch, sequence: cfg.sequences.roundtrip });
        const S = { noteIdx: 0 };
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'touch') {
                playNext(S, scene, e.finger, 0.5);
                if (basket.children.length >= 8) basket.innerHTML = '';
                const i = document.createElement('i');
                i.className = 'note';
                basket.appendChild(i);
              } else if (e.type === 'rep') {
                scene.floatText('+1 回', scene.thumbPos);
              }
            }
            const cur = tracker.current;
            scene.draw({ source: demo, feat: f, mode: 'game', target: cur.target, contact: cur.contact, pending: cur.pending, now });
          }
        };
      }
    }
  };
})(window);
