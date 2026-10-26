// 遊戲定義：騎腳踏車（站姿抬膝，正面；站在椅子旁、一手扶椅背，抬起來就放下）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const B = RCDD.bike;
  const cfg = RCDD.exercises['knee-lift'];
  const LEG = { L: '左腳', R: '右腳' };
  // 兩個膝蓋差不多高 = 兩腳都踩在地上
  const bothDown = f => !!(f && f.visible && Math.abs(f.legs.L.rel - f.legs.R.rel) < 0.1);
  // 站著時膝蓋在臀部下方很遠；坐著時膝蓋和臀部差不多高
  const standing = f => !!(f && f.visible && Math.max(f.legs.L.rel, f.legs.R.rel) < -0.6);

  function arriveAt(stop, ctx) {
    RCDD.music.bell();
    ctx.scene.arrive(stop.name);
    ctx.S.stopsDone.push(stop.name);
    const last = stop.at === cfg.reps;
    ctx.say(last ? '回到高雄了！環島完成，好厲害！' : '到' + stop.name + '了！', 2, last ? '回到高雄，環島完成！' : '抵達 ' + stop.name + '！');
  }

  function drawFrame(S, tr, extra) {
    const cur = tr ? tr.current : null;
    return Object.assign({
      cue: cur ? cur.cue : 'R',
      base: tr && cur ? tr.baseline.rel[cur.cue] : null,
      target: tr && cur ? tr.targets[cur.cue] : 0.5,
      reached: cur ? cur.reached : false,
      progress: cur ? cur.progress : 0,
      trip: cfg
    }, extra);
  }

  RCDD.games.bike = {
    id: 'bike',
    name: '騎腳踏車',
    motion: '站姿抬膝',
    cfg,
    // knee-extension 是更早的側面版騎腳踏車紀錄
    aliases: ['knee-extension'],
    seenKey: 'tutorialSeen.bike3',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      // 膝蓋不能太靠近畫面底部，否則會被下方的按鈕列擋住
      { id: 'body', label: '看得到肩膀和兩個膝蓋', hint: '請站遠一點，或把鏡頭往下調，讓我看到您的肩膀和兩個膝蓋', test: (f, S) => !!(f && f.visible && Math.max(f.legs.L.knee.y, f.legs.R.knee.y) < S.source.height * 0.8) },
      { id: 'stand', label: '站起來，扶著椅背', hint: '請站起來，站在椅子旁邊，一手扶著椅背', test: standing },
      { id: 'front', label: '正面站好', hint: '請把身體轉正，面對螢幕', test: f => !!(f && f.visible && f.frontal) },
      { id: 'feet', label: '雙腳踩在地上', hint: '請先把兩隻腳放下，踩在地上', test: bothDown }
    ],
    checkVoice: '請站在椅子旁邊，一手扶著椅背，正面對著螢幕，讓我看到您的肩膀和兩個膝蓋',

    newScene: canvas => new RCDD.BikeScene(canvas),
    newExtractor: () => new B.BikeFeatureExtractor(),
    newDemo: () => new RCDD.DemoBikePose(),

    newTracker({ calibrating, profile, baseline }) {
      return new B.LegTracker(cfg, { calibrating, targets: profile && profile.targets, baseline });
    },

    calibIntro: ['先左右腳各抬 2 下，讓我認識您的腳。扶好椅背，看提示的那隻腳，把膝蓋往上抬，抬到不勉強的高度就好，再放下來。', '扶好椅背，左右腳各抬 2 下'],
    calibStartBubble: '膝蓋往上抬，抬到最高就好',
    onCalibEvent(e, ctx) {
      if (e.type === 'cue') ctx.bubble('抬' + LEG[e.leg] + '，膝蓋往上抬');
      else if (e.type === 'wrong') ctx.say('換另一隻腳，請抬' + LEG[e.expect], 2);
    },
    onCalibRep(e, ctx) {
      ctx.voice.sfx.drop();
      return { leg: e.rep.leg, max: e.rep.max };
    },
    calibRepSay(e) {
      return ['很好，換' + LEG[e.rep.leg === 'R' ? 'L' : 'R'], '很好！換' + LEG[e.rep.leg === 'R' ? 'L' : 'R']];
    },
    finishCalibration(values, old) {
      const targets = B.computeTargets(values, cfg);
      return {
        // standing：站姿版的測量結果（舊的坐姿測量要重新做）
        profile: { targets, standing: true, firstTargets: old && old.standing && old.firstTargets ? old.firstTargets : targets, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: '已經依照您抬膝的高度，\n設定好左右腳的目標',
        voice: '測量完成！已經依照您抬膝的高度，設定好左右腳的目標。我們從高雄出發，騎腳踏車環島吧！',
        button: '出發'
      };
    },
    hasProfile: p => !!(p && p.targets && p.standing),

    gameIntro: ['我們從高雄出發，騎腳踏車環島吧！扶好椅背，看提示的那隻腳，把膝蓋往上抬，抬起來就放下，左右腳輪流，腳踏車就會往前騎。', '從高雄出發！扶好椅背，左右輪流抬膝'],
    onStartGame(ctx) {
      ctx.S.stopsDone = [];
      RCDD.music.startLoop(0.45);
    },
    onResume() {
      RCDD.music.startLoop(0.45);
    },

    onEvent(e, ctx) {
      const S = ctx.S;
      if (e.type === 'cue') {
        ctx.bubble('抬' + LEG[e.leg] + '，膝蓋往上抬', true);
        if (S.scores.length > 0) ctx.voice.speak('換' + LEG[e.leg], 1);
      } else if (e.type === 'start') ctx.bubble('膝蓋往上抬');
      else if (e.type === 'near') ctx.bubble('再高一點點', true);
      else if (e.type === 'reached') { ctx.voice.sfx.beep(); ctx.bubble('很好！放下來', true); }
      else if (e.type === 'wrong') ctx.say('換另一隻腳，請抬' + LEG[e.expect], 2);
    },

    onRep(e, ctx) {
      const n = ctx.S.scores.length;
      const stop = cfg.stops.find(s => s.at === n);
      if (stop) arriveAt(stop, ctx);
      else if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      else if (!e.score.reached) ctx.say('很好，下一下再抬高一點', 1);
    },

    drawParams(S) {
      const tr = S.tracker;
      const game = S.phase === 'game' || S.phase === 'ending';
      const reps = game ? S.scores.length : 0;
      return drawFrame(S, tr, {
        reps,
        dist: reps + (game && tr && tr.state === 'active' ? 0.6 * tr.current.progress : 0)
      });
    },

    updateHud(S, $) {
      $('handLbl').textContent = '現在抬';
      $('handNow').textContent = LEG[S.tracker.current.cue];
      const n = S.phase === 'game' ? S.scores.length : 0;
      const html = cfg.stops.map(s => '<i style="--c:#E06D4F" class="' + (s.at <= n ? 'done' : '') + '" title="' + s.name + '">' +
        (s.id === 'taipei101' ? '北' : s.name[0]) + '</i>').join('');
      if ($('seqDots').innerHTML !== html) $('seqDots').innerHTML = html;
    },

    summarize: scores => B.summarizeBike(scores, cfg),
    record: sum => ({ reached: sum.reached, left: sum.left, right: sum.right, stops: sum.stops }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['抬膝高度', sum.parts.range, w.range, '#2E6B4E'],
        ['姿勢正確', sum.parts.form, w.form, '#4C9C62'],
        ['節奏平穩', sum.parts.tempo, w.tempo, '#6C8FB3']
      ];
    },

    result(sum) {
      const k = sum.stops.length;
      const done = k === cfg.stops.length;
      const legs = [];
      if (sum.right) legs.push('右腳平均達到目標 ' + sum.right.percent + '%');
      if (sum.left) legs.push('左腳 ' + sum.left.percent + '%');
      return {
        sub: done ? '從高雄出發，環島一圈回到高雄！' : (k ? '從高雄騎到' + sum.stops[k - 1] + '，收集到 ' + k + ' 張明信片' : '從高雄出發，再騎幾下就到墾丁了'),
        chip: (k ? '明信片：' + sum.stops.join('、') + '　' : '') + legs.join('、'),
        speech: done ? '今天騎腳踏車環島一圈' : '今天騎了 ' + sum.reps + ' 下'
      };
    },

    perfText: s => (s.reps && s.stops ? '經過 ' + s.stops.length + ' 站' : '—'),
    profileNote: p => (p && p.targets && p.standing
      ? '騎腳踏車：已依能力測量設定左右腳的抬膝目標'
      : '騎腳踏車：第一次玩會先左右腳各抬 2 下能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '明信片',
      steps: [
        {
          label: '怎麼玩',
          title: '扶著椅背站好，膝蓋往上抬',
          caption: '扶好椅背，膝蓋往上抬 → 放下；左右腳輪流',
          html:
            '<p>站在一張<b>穩固的椅子旁邊</b>，<b>一手扶著椅背</b>，<b>正面</b>對著鏡頭。椅子放在身體旁邊，不要擋在腳前面。</p>' +
            '<p>把一隻腳的<b>膝蓋往上抬</b>，像原地踏步，<b>抬起來就放下</b>。左右腳輪流，各 5 下。</p>',
          voice: '歡迎來騎腳踏車！請站在一張穩固的椅子旁邊，一手扶著椅背，正面對著鏡頭。椅子放在身體旁邊，不要擋在腳前面。把一隻腳的膝蓋往上抬，像原地踏步，抬起來就放下。左右腳輪流，各五下。'
        },
        {
          label: '騎車環島',
          title: '抬一下腳，腳踏車就往前騎',
          caption: '從高雄出發，經過 5 個景點再回到高雄',
          html:
            '<p>畫面上方有一台腳踏車。每抬一下膝蓋，車子就前進一段路。膝蓋旁的虛線是要抬到的高度。</p>' +
            '<p>從<b>高雄</b>出發，經過墾丁、花蓮太魯閣、台北101、日月潭、阿里山，最後回到高雄。到每個景點都會收到一張明信片。</p>',
          voice: '畫面上方有一台腳踏車。每抬一下膝蓋，車子就前進一段路。膝蓋旁的虛線，是要抬到的高度。我們從高雄出發，經過墾丁、花蓮太魯閣、台北一零一、日月潭、阿里山，最後回到高雄。到每個景點，都會收到一張明信片。'
        },
        {
          label: '計分',
          title: '每一下都會打分數',
          caption: '每抬完一下，就會算出分數',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>抬膝高度</b>膝蓋抬到虛線的高度</span><em>50 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>姿勢正確</b>身體站直、不往後仰、不歪一邊</span><em>30 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>節奏平穩</b>不要太快，也不用太慢</span><em>20 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">第一次玩會先左右腳各抬 2 下「能力測量」，幫兩隻腳分別設定目標。</p>',
          voice: '每一下都會打分數。抬膝高度、姿勢正確、節奏平穩，加起來一百分。第一次玩，會先左右腳各抬兩下能力測量。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '一定要扶著椅背；頭暈或會痛就停下來',
          html:
            '<ul class="tut-safety">' +
            '<li><b>一定要扶著穩固的椅背</b>（不要用有輪子的椅子），旁邊最好有家人陪</li>' +
            '<li>抬到不勉強的高度就好，<b>站不穩就先坐下休息</b></li>' +
            '<li>頭暈、膝蓋或髖關節開過刀、有傷或很痛，先問過醫師或治療師</li>' +
            '<li>會痛就按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '</ul>',
          voice: '最後是注意事項。一定要扶著穩固的椅背，不要用有輪子的椅子，旁邊最好有家人陪。抬到不勉強的高度就好，站不穩就先坐下休息。頭暈、膝蓋或髖關節開過刀、有傷或很痛，先問過醫師或治療師。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：虛擬長輩扶著椅背、左右輪流抬膝，腳踏車往前騎
      makeSim(canvas, basket) {
        const scene = new RCDD.BikeScene(canvas);
        scene.tripBox = { side: 16, top: 16, h: 120 };
        scene.zoom = 0.75;
        const demo = new RCDD.DemoBikePose();
        demo.leanReps = new Set();
        demo.tiltReps = new Set();
        demo.peaks = [0.68];
        demo.start(performance.now(), 0);
        const fx = new B.BikeFeatureExtractor();
        const smoother = new RCDD.geo.LandmarkSmoother(0.5);
        const tracker = new B.LegTracker(cfg, { targets: { L: 0.65, R: 0.65 } });
        let reps = 0;
        RCDD.music.startLoop(0.25);
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'rep') {
                reps++;
                scene.floatText('+' + e.score.total + ' 分');
                const stop = cfg.stops.find(s => s.at === reps % cfg.reps);
                if (stop) {
                  RCDD.music.bell();
                  scene.arrive(stop.name);
                  if (basket.children.length >= 6) basket.innerHTML = '';
                  const i = document.createElement('i');
                  i.className = 'note';
                  basket.appendChild(i);
                }
              }
            }
            const r = reps % cfg.reps;
            scene.draw(Object.assign({ source: demo, feat: f, mode: 'game', now },
              drawFrame(null, tracker, { reps: r, dist: r + (tracker.state === 'active' ? 0.6 * tracker.current.progress : 0) })));
          }
        };
      }
    }
  };
})(window);
