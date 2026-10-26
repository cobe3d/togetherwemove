// 遊戲定義：踢足球（站姿往前踢腿，正面；站在椅子旁、一手扶椅背，踢出去就收回）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  RCDD.games = RCDD.games || {};
  const K = RCDD.soccer;
  const cfg = RCDD.exercises['front-kick'];
  const LEG = { L: '左腳', R: '右腳' };
  // 兩個腳踝差不多高 = 兩腳都踩在地上
  const bothDown = f => !!(f && f.visible && Math.abs(f.legs.L.a - f.legs.R.a) < 0.12);
  // 站著時膝蓋在臀部下方很遠；坐著時膝蓋和臀部差不多高
  const standing = f => !!(f && f.visible && Math.max(f.legs.L.rel, f.legs.R.rel) < -0.6);

  function drawFrame(tr, extra) {
    const cur = tr ? tr.current : null;
    return Object.assign({
      cue: cur ? cur.cue : 'R',
      base: tr ? tr.baseline.a : null,
      target: tr && cur ? tr.targets[cur.cue] : cfg.defaultTarget,
      reached: cur ? cur.reached : false,
      progress: cur ? cur.progress : 0
    }, extra);
  }

  RCDD.games.soccer = {
    id: 'soccer',
    name: '踢足球',
    motion: '站姿踢腿',
    cfg,
    // knee-kick 是改版前「放天燈」的紀錄，統計時算在這個遊戲
    aliases: ['knee-kick'],
    seenKey: 'tutorialSeen.soccer',
    calibLabel: '能力測量',

    checks: [
      { id: 'light', label: '光線足夠', hint: '光線有點暗，請把燈打開', test: (f, S) => S.brightness > 45 },
      { id: 'body', label: '看得到肩膀、膝蓋和腳踝', hint: '請站遠一點，或把鏡頭往下調，讓我看到您的肩膀和兩隻腳踝', test: (f, S) => !!(f && f.visible && Math.max(f.legs.L.ankle.y, f.legs.R.ankle.y) < S.source.height * 0.98) },
      { id: 'stand', label: '站起來，扶著椅背', hint: '請站起來，站在椅子旁邊，一手扶著椅背', test: standing },
      { id: 'front', label: '正面站好', hint: '請把身體轉正，面對螢幕', test: f => !!(f && f.visible && f.frontal) },
      { id: 'feet', label: '雙腳踩在地上', hint: '請先把兩隻腳放下，踩在地上', test: bothDown }
    ],
    checkVoice: '請站在椅子旁邊，一手扶著椅背，正面對著螢幕，讓我看到您的肩膀和兩隻腳踝',

    newScene: canvas => new RCDD.SoccerScene(canvas),
    newExtractor: () => new K.SoccerFeatureExtractor(),
    newDemo: () => new RCDD.DemoSoccerPose(),

    newTracker({ calibrating, profile, baseline }) {
      return new K.SoccerTracker(cfg, { calibrating, targets: profile && profile.targets, baseline });
    },

    calibIntro: ['先左右腳各踢 2 下，讓我認識您的腳。扶好椅背，看提示的那隻腳，把腳往前踢，踢到不勉強的高度就好，再收回來。', '扶好椅背，左右腳各踢 2 下'],
    calibStartBubble: '腳往前踢，踢到不勉強的高度就好',
    onCalibEvent(e, ctx) {
      if (e.type === 'cue') ctx.bubble('踢' + LEG[e.leg] + '，往前踢出去');
      else if (e.type === 'wrong') ctx.say('換另一隻腳，請踢' + LEG[e.expect], 2);
    },
    onCalibRep(e, ctx) {
      ctx.voice.sfx.drop();
      return { leg: e.rep.leg, max: e.rep.max };
    },
    calibRepSay(e) {
      const next = LEG[e.rep.leg === 'R' ? 'L' : 'R'];
      return ['很好，換' + next, '很好！換' + next];
    },
    finishCalibration(values, old) {
      const targets = K.computeTargets(values, cfg);
      return {
        profile: { targets, firstTargets: old && old.firstTargets ? old.firstTargets : targets, calibratedAt: new Date().toISOString() },
        title: '測量完成',
        text: '已經依照您踢腿的高度，\n設定好左右腳的目標',
        voice: '測量完成！已經依照您踢腿的高度，設定好左右腳的目標。我們來踢足球吧！',
        button: '開始踢球'
      };
    },
    hasProfile: p => !!(p && p.targets),

    gameIntro: ['我們來踢足球吧！扶好椅背，看提示的那隻腳，往前踢到球，球就會飛進球門。踢出去就收回來，左右腳輪流。', '扶好椅背，往前踢到球就射門'],
    onStartGame(ctx) {
      RCDD.music.whistle(false);
    },

    onEvent(e, ctx) {
      const S = ctx.S;
      if (e.type === 'cue') {
        ctx.bubble('踢' + LEG[e.leg] + '，往前踢到球', true);
        if (S.scores.length > 0) ctx.voice.speak('換' + LEG[e.leg], 1);
      } else if (e.type === 'start') ctx.bubble('往前踢出去');
      else if (e.type === 'near') ctx.bubble('再踢高一點點', true);
      else if (e.type === 'reached') {
        // 踢到球：馬上射門
        RCDD.music.kick();
        ctx.scene.shoot(true);
        setTimeout(() => RCDD.music.cheer(), 750);
        ctx.say('射門！', 2, '射門！收回來');
      } else if (e.type === 'wrong') ctx.say('換另一隻腳，請踢' + LEG[e.expect], 2);
    },

    onRep(e, ctx) {
      const S = ctx.S;
      const n = S.scores.length;
      if (!e.score.reached) {
        // 沒踢到目標：球軟軟地被守門員接住
        RCDD.music.kick();
        ctx.scene.shoot(false);
        setTimeout(() => RCDD.music.groan(), 750);
      }
      if (n === cfg.reps) {
        const goals = S.scores.filter(s => s.reached).length;
        S.finaleMs = 2200;
        setTimeout(() => {
          RCDD.music.whistle(true);
          ctx.scene.showBanner('比賽結束！進球 ' + goals + ' 球', '#2E6B4E');
        }, 1300);
        return;
      }
      if (!e.score.reached) ctx.say('差一點！下一下再踢高一點', 2);
      else if (e.score.faultVoice) ctx.say(e.score.faultVoice, 2);
      else if (n === cfg.reps / 2) ctx.say('已經做了一半，加油！', 1);
    },

    drawParams(S) {
      const game = S.phase === 'game' || S.phase === 'ending';
      return drawFrame(S.tracker, { reps: game ? S.scores.length : 0, total: game ? cfg.reps : 0 });
    },

    updateHud(S, $) {
      $('handLbl').textContent = '現在踢';
      $('handNow').textContent = LEG[S.tracker.current.cue];
      const cue = S.tracker.current.cue;
      const html = ['R', 'L'].map(s => '<i style="--c:#3D7DB8" class="' + (s === cue ? 'now' : '') + '">' + (s === 'R' ? '右' : '左') + '</i>').join('');
      if ($('seqDots').innerHTML !== html) $('seqDots').innerHTML = html;
    },

    summarize: scores => K.summarizeSoccer(scores, cfg),
    record: sum => ({ goals: sum.goals, left: sum.left, right: sum.right }),

    bars(sum) {
      const w = cfg.weights;
      return [
        ['踢腿高度', sum.parts.range, w.range, '#2E6B4E'],
        ['姿勢正確', sum.parts.form, w.form, '#4C9C62'],
        ['節奏平穩', sum.parts.tempo, w.tempo, '#6C8FB3']
      ];
    },

    result(sum) {
      const g = sum.goals;
      const legs = [];
      if (sum.right) legs.push('右腳平均達到目標 ' + sum.right.percent + '%');
      if (sum.left) legs.push('左腳 ' + sum.left.percent + '%');
      return {
        sub: g === sum.reps ? '每一腳都進球，太厲害了！' : g ? '一共踢進 ' + g + ' 球' : '下次再踢高一點，就能進球了',
        chip: '進球 ' + g + ' / ' + sum.reps + '　' + legs.join('、'),
        speech: g ? '今天踢進 ' + g + ' 球' : '今天踢了 ' + sum.reps + ' 下'
      };
    },

    perfText: s => (s.reps ? '進球 ' + (s.goals || 0) + ' 球' : '—'),
    profileNote: p => (p && p.targets
      ? '踢足球：已依能力測量設定左右腳的踢腿目標'
      : '踢足球：第一次玩會先左右腳各踢 2 下能力測量'),

    // ---------- 遊戲說明 ----------
    tutorial: {
      basketLabel: '進球',
      steps: [
        {
          label: '怎麼玩',
          title: '扶著椅背站好，腳往前踢',
          caption: '扶好椅背，腳往前踢 → 收回；左右腳輪流',
          html:
            '<p>站在一張<b>穩固的椅子旁邊</b>，<b>一手扶著椅背</b>，<b>正面</b>對著鏡頭。椅子放在身體旁邊，不要擋在腳前面。</p>' +
            '<p>腳盡量伸直，<b>往前踢出去</b>，像在踢球，<b>踢出去就收回</b>。左右腳輪流，各 5 下。</p>',
          voice: '歡迎來踢足球！請站在一張穩固的椅子旁邊，一手扶著椅背，正面對著鏡頭。椅子放在身體旁邊，不要擋在腳前面。腳盡量伸直，往前踢出去，像在踢球，踢出去就收回。左右腳輪流，各五下。'
        },
        {
          label: '射門',
          title: '踢到球，就會射門',
          caption: '腳踢到虛線上的球 → 球飛進球門',
          html:
            '<p>腳前面的虛線上有一顆<b>足球</b>，就是要踢到的高度。腳踢到球，球就會飛向右上角的<b>球門</b>，觀眾會歡呼。</p>' +
            '<p>踢得不夠高也算 1 下，但球會被守門員接住。下一下再踢高一點就好。</p>',
          voice: '腳前面的虛線上有一顆足球，就是要踢到的高度。腳踢到球，球就會飛向右上角的球門，觀眾會歡呼。踢得不夠高也算一下，但球會被守門員接住，下一下再踢高一點就好。'
        },
        {
          label: '計分',
          title: '每一下都會打分數',
          caption: '每踢完一下，就會算出分數',
          html:
            '<ul class="tut-score">' +
            '<li><i style="background:#2E6B4E"></i><span><b>踢腿高度</b>腳踢到球的高度</span><em>50 分</em></li>' +
            '<li><i style="background:#4C9C62"></i><span><b>姿勢正確</b>身體站直、不歪一邊、腳盡量伸直</span><em>30 分</em></li>' +
            '<li><i style="background:#6C8FB3"></i><span><b>節奏平穩</b>不要太急，也不用太慢</span><em>20 分</em></li>' +
            '</ul>' +
            '<p class="tut-small">第一次玩會先左右腳各踢 2 下「能力測量」，幫兩隻腳分別設定目標。</p>',
          voice: '每一下都會打分數。踢腿高度、姿勢正確、節奏平穩，加起來一百分。第一次玩，會先左右腳各踢兩下能力測量。'
        },
        {
          label: '注意事項',
          title: '安全最重要',
          caption: '一定要扶著椅背；頭暈或會痛就停下來',
          html:
            '<ul class="tut-safety">' +
            '<li><b>一定要扶著穩固的椅背</b>（不要用有輪子的椅子），旁邊最好有家人陪</li>' +
            '<li>踢到不勉強的高度就好，<b>不用用力甩</b>；站不穩就先坐下休息</li>' +
            '<li>頭暈、膝蓋或髖關節開過刀、有傷或很痛，先問過醫師或治療師</li>' +
            '<li>會痛就按 <span class="fake-pain">會痛就按這裡</span></li>' +
            '</ul>',
          voice: '最後是注意事項。一定要扶著穩固的椅背，不要用有輪子的椅子，旁邊最好有家人陪。踢到不勉強的高度就好，不用用力甩，站不穩就先坐下休息。頭暈、膝蓋或髖關節開過刀、有傷或很痛，先問過醫師或治療師。準備好了，就按我知道了，開始。'
        }
      ],

      // 示範動畫：虛擬長輩扶著椅背、左右輪流往前踢，球飛進球門
      makeSim(canvas, basket) {
        const scene = new RCDD.SoccerScene(canvas);
        scene.fieldBox = { side: 16, top: 16, h: 120 };
        scene.zoom = 0.75;
        const demo = new RCDD.DemoSoccerPose();
        demo.leanReps = new Set();
        demo.bentReps = new Set();
        demo.peaks = [0.62, 0.64, 0.62, 0.3];
        demo.start(performance.now(), 0);
        const fx = new K.SoccerFeatureExtractor();
        const smoother = new RCDD.geo.LandmarkSmoother(0.5);
        const tracker = new K.SoccerTracker(cfg, { targets: { L: 0.55, R: 0.55 } });
        let reps = 0;
        return {
          scene,
          frame(now) {
            const f = fx.extract(smoother.smooth(demo.read(now)));
            for (const e of tracker.update(f, now / 1000)) {
              if (e.type === 'reached') {
                RCDD.music.kick();
                scene.shoot(true);
                setTimeout(() => RCDD.music.cheer(), 750);
                if (basket.children.length >= 10) basket.innerHTML = '';
                const i = document.createElement('i');
                i.className = 'ball';
                basket.appendChild(i);
              } else if (e.type === 'rep') {
                reps++;
                scene.floatText('+' + e.score.total + ' 分', { x: scene.w * 0.5, y: scene.h * 0.55 });
                if (!e.score.reached) { RCDD.music.kick(); scene.shoot(false); }
              }
            }
            scene.draw(Object.assign({ source: demo, feat: f, mode: 'game', now }, drawFrame(tracker, { reps: reps % cfg.reps, total: 0 })));
          }
        };
      }
    }
  };
})(window);
