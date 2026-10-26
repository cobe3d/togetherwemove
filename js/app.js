// 主流程：首頁 → 遊戲說明（第一次）→ 位置檢查 → 能力測量（第一次）→ 遊戲 → 結算
// 每個遊戲的差異寫在 js/games/*.js，這裡只處理共用流程。
(function () {
  'use strict';
  const { geo, voice, storage, garden: GD, exercise: EX } = RCDD;
  const GAMES = RCDD.games;
  const $ = id => document.getElementById(id);

  const S = {
    game: GAMES.apple,
    running: false,
    phase: 'home',
    demo: false,
    source: null,
    camera: null,
    scene: null,
    scenes: {},
    smoother: new geo.LandmarkSmoother(0.5),
    extractor: null,
    tracker: null,
    feat: null,
    lm: null,
    profile: null,
    calib: [],
    scores: [],
    picked: 0,
    combo: 0,
    phraseIdx: 0,
    paused: false,
    okSince: null,
    countdown: null,
    lastHintAt: 0,
    lastLostAt: 0,
    lastSayAt: 0,
    brightness: 0,
    brightAt: 0,
    startedAt: 0,
    finishTimer: null
  };

  // aliases：改版前的動作代號（例如放天燈改成踢足球），舊紀錄也找得到對應的遊戲
  const gameOfRecord = r => Object.values(GAMES).find(g => g.cfg.id === r.exercise || (g.aliases || []).includes(r.exercise)) || GAMES.apple;

  // ---------- 畫面切換 ----------
  function showScreen(name) {
    for (const s of ['home', 'garden', 'tutorial', 'play', 'result']) $('screen-' + s).hidden = s !== name;
    $('topHomeBtn').hidden = name === 'home';
    const G = S.game;
    $('topTitle').textContent = name === 'home' ? '回春動動'
      : name === 'garden' ? '回春花園'
      : name === 'tutorial' ? G.name + ' · 遊戲說明'
      : G.name + ' · ' + G.motion + (S.demo ? '（示範）' : '');
    if (name === 'home') renderHome();
    if (name === 'garden') renderGarden();
    if (name === 'play' && S.scene) S.scene.resize();
    window.scrollTo(0, 0);
  }

  function setPhase(p) {
    S.phase = p;
    $('screen-play').dataset.phase = p;
  }

  function bubble(text, pop) {
    const el = $('bubbleText');
    if (el.textContent === text) return;
    el.textContent = text;
    if (pop) {
      const b = $('bubble');
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
    }
  }

  // shortText：語音說完整句，提示框只顯示重點
  function say(text, priority, shortText) {
    bubble(shortText || text, true);
    voice.speak(text, priority);
    S.lastSayAt = performance.now();
  }

  // 剛說完重要提示時，不要馬上蓋掉提示框
  function softBubble(text, pop) {
    if (performance.now() - S.lastSayAt > 1500) bubble(text, pop);
  }

  function overlay(title, text, actions, spinner) {
    const ov = $('overlay');
    if (!title) { ov.hidden = true; return; }
    $('ovTitle').textContent = title;
    $('ovText').textContent = text || '';
    const box = $('ovActions');
    box.innerHTML = '';
    if (spinner) {
      const sp = document.createElement('div');
      sp.className = 'spinner';
      box.appendChild(sp);
    }
    for (const a of actions || []) {
      const b = document.createElement('button');
      b.className = a.primary ? 'btn-primary' : 'btn-outline';
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      box.appendChild(b);
    }
    ov.hidden = false;
    const first = box.querySelector('button');
    if (first) first.focus();
  }

  // 給遊戲定義使用的工具
  function ctx() {
    return { S, say, bubble: softBubble, voice, scene: S.scene, basketPoint, addBasket, rest: restBreak, $ };
  }

  // 遊戲中途的休息（例如換手），倒數結束或按按鈕後繼續
  function restBreak(seconds, title, text, onDone) {
    setPhase('interlude');
    let left = seconds;
    const show = () => overlay(title, text + '\n\n' + left + ' 秒', [{ label: '我準備好了', primary: true, onClick: done }]);
    function done() {
      clearInterval(S.restTimer);
      S.restTimer = null;
      overlay(null);
      setPhase('game');
      onDone();
    }
    show();
    S.restTimer = setInterval(() => {
      left--;
      if (left <= 0) done();
      else $('ovText').textContent = text + '\n\n' + left + ' 秒';
    }, 1000);
  }

  const unitOf = G => G.unit || '下';

  // ---------- 首頁 ----------
  function renderHome() {
    const h = new Date().getHours();
    const hello = h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
    $('greeting').textContent = hello + '！今天也來動一動吧';

    const streak = storage.streak();
    $('streak').hidden = streak < 1;
    $('streak').textContent = '連續運動 ' + streak + ' 天';
    renderGardenCard();
    renderPoints();
    renderStats();

    const notes = Object.values(GAMES).map(g => g.profileNote(storage.getProfile(g.cfg.id)));
    $('profileNote').innerHTML = notes.map(n => '<span>' + n + '</span>').join('<br>');
    $('recalBtn').hidden = !Object.values(GAMES).some(g => g.hasProfile(storage.getProfile(g.cfg.id)));

    const list = storage.listSessions().slice(-6).reverse();
    const box = $('records');
    if (!list.length) {
      box.innerHTML = '<p class="empty">還沒有紀錄。選一個遊戲按「開始」，做完就會出現在這裡。</p>';
      return;
    }
    const rows = list.map(s => {
      const g = gameOfRecord(s);
      const d = new Date(s.date);
      const date = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const note = s.painStop ? '會痛停止' : (noteFor(s) || '狀況很好');
      return '<tr><td>' + date + (s.demo ? ' <span class="demo">示範</span>' : '') + '</td><td>' + g.name + '</td><td>' + s.reps + '</td><td>' +
        (s.reps ? s.total : '—') + '</td><td>' + g.perfText(s) + '</td><td class="' + (s.painStop || noteFor(s) ? 'warn' : '') + '">' + note + '</td></tr>';
    }).join('');
    box.innerHTML = '<table class="rec-table"><thead><tr><th>時間</th><th>遊戲</th><th>次數</th><th>分數</th><th>表現</th><th>系統備註</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function noteFor(s) {
    if (!s.faultCounts) return '';
    const g = s.exercise ? gameOfRecord(s) : S.game;
    return g.cfg.checks.filter(c => s.faultCounts[c.type] > 0).map(c => c.label + ' ' + s.faultCounts[c.type] + ' 次').join('、');
  }

  // ---------- 我的點數 ----------
  function renderPoints() {
    const R = GD.RULES;
    const p = GD.pointsSummary(storage.listLedger());
    $('ptBalance').textContent = p.balance;
    $('ptToday').textContent = p.today + ' / ' + p.cap;
    $('ptTodayNote').textContent = p.leftToday ? '今天還能再得 ' + p.leftToday + ' 點' : '今天的點數集滿了';
    $('ptEarned').textContent = p.earned;
    $('ptRedeemed').textContent = p.redeemed + ' 張';
    $('ptRedeemNote').textContent = p.redeemed ? '共 ' + p.redeemedValue + ' 元' + (p.pending ? '，' + p.pending + ' 張待核發' : '') : R.redeemValue + ' 元一張';
    $('ptBar').style.width = (100 * p.progress).toFixed(0) + '%';
    $('ptNext').innerHTML = p.canRedeem
      ? '<b>可以兌換 ' + R.redeemValue + ' 元購物金了！</b>'
      : '已集 ' + Math.min(p.balance, R.redeemPoints) + ' / ' + R.redeemPoints + ' 點，再 <b>' + p.toNext + ' 點</b>可換 ' + R.redeemValue + ' 元購物金';
    $('ptGo').classList.toggle('ready', p.canRedeem);
  }

  // ---------- 運動次數統計 ----------
  const ST = RCDD.stats;
  let statsRange = ST.preset('7');

  function renderStats() {
    const t = ST.table(storage.usage(), statsRange.from, statsRange.to);
    statsRange = { from: t.from, to: t.to };
    $('statsFrom').value = t.from;
    $('statsTo').value = t.to;
    // 目前區間剛好是快速選擇的哪一個，就把那個按鈕亮起來
    document.querySelectorAll('[data-range]').forEach(b => {
      const p = ST.preset(b.dataset.range);
      b.setAttribute('aria-pressed', String(p.from === t.from && p.to === t.to));
    });
    $('statsSum').innerHTML = '共 <b>' + t.total + '</b> 次 · ' + t.activeDays + ' 天有運動';

    const cell = (n, cls) => n ? '<td class="' + (cls || '') + '"><b>' + n + '</b></td>' : '<td class="zero">–</td>';
    const today = ST.dayKey(new Date());
    const head = '<thead><tr><th scope="col">日期</th>' + ST.GAMES.map(g => '<th scope="col">' + g.name + '</th>').join('') + '<th scope="col">合計</th></tr></thead>';
    const body = '<tbody>' + t.rows.map(r => '<tr class="' + (r.day === today ? 'today' : '') + '"><td>' + ST.dayLabel(r.day) + '</td>' +
      r.counts.map(n => cell(n)).join('') + cell(r.total, 'total') + '</tr>').join('') + '</tbody>';
    const foot = '<tfoot><tr><td>區間合計</td>' + t.totals.map(n => cell(n)).join('') + cell(t.total, 'total') + '</tr></tfoot>';
    $('statsTable').innerHTML = head + body + foot;
  }

  function onStatsDate() {
    const from = $('statsFrom').value, to = $('statsTo').value;
    if (!from || !to) return;
    statsRange = { from, to };
    renderStats();
  }

  // ---------- 回春花園 ----------
  function gardenState() {
    const days = GD.waterDays(storage.listSessions());
    const ledger = storage.listLedger();
    return { days, grow: GD.growth(days), ledger, points: GD.balance(ledger) };
  }

  function stageText(g) {
    if (g.grow.bloomedNow) return '開花了！明天會種下新的種子';
    return '已澆水 ' + g.grow.inCycle + ' 天，再 ' + g.grow.daysToBloom + ' 天開花';
  }

  function pointsNextText(points) {
    const R = GD.RULES;
    if (points >= R.redeemPoints) return '可以兌換 ' + R.redeemValue + ' 元購物金了！';
    return '再 ' + (R.redeemPoints - points) + ' 點可換 ' + R.redeemValue + ' 元購物金';
  }

  function renderGardenCard() {
    const g = gardenState();
    $('gcPlant').innerHTML = GD.plantSVG(g.grow.stage.id, g.grow.bloomedNow ? g.grow.flowers - 1 : g.grow.flowers);
    $('gcStage').textContent = g.grow.stage.label + ' · ' + stageText(g);
    $('gcBar').style.width = (100 * g.grow.inCycle / GD.RULES.bloomDays).toFixed(0) + '%';
    $('gcPoints').textContent = g.points;
    $('gcPointsNext').textContent = pointsNextText(g.points);
  }

  const DROP = on => '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M18 3 C18 3 4 20 4 29 A14 14 0 0 0 32 29 C32 20 18 3 18 3Z" fill="' +
    (on ? '#4F9BD9' : '#E6EBE7') + '"/>' + (on ? '<ellipse cx="12" cy="28" rx="3" ry="5" fill="#FFFFFF" fill-opacity=".5"/>' : '') + '</svg>';

  function shortDate(iso) {
    const d = new Date(iso);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function renderGarden() {
    const g = gardenState();
    const R = GD.RULES;
    $('gPlant').innerHTML = GD.plantSVG(g.grow.stage.id, g.grow.bloomedNow ? g.grow.flowers - 1 : g.grow.flowers);
    $('gStage').textContent = g.grow.stage.label;
    $('gStageText').textContent = stageText(g);
    $('gDrops').innerHTML = Array.from({ length: R.bloomDays }, (_, i) => '<li>' + DROP(i < g.grow.inCycle) + '</li>').join('');
    $('gTotal').textContent = g.days ? '到現在一共運動了 ' + g.days + ' 天。' : '今天做完第一次運動，就會幫種子澆第一次水。';
    $('gFlowers').textContent = g.grow.flowers;
    $('gBed').innerHTML = g.grow.flowers ? GD.bedSVG(g.grow.flowers) : '<p class="note">第一朵花開了，就會種到這個花圃裡。</p>';

    $('gPoints').textContent = g.points;
    $('gPtsBar').style.width = (100 * Math.min(g.points, R.redeemPoints) / R.redeemPoints).toFixed(0) + '%';
    $('gPtsNext').textContent = pointsNextText(g.points);
    $('redeemBtn').disabled = g.points < R.redeemPoints;
    $('redeemBtn').textContent = '兌換 ' + R.redeemValue + ' 元購物金（' + R.redeemPoints + ' 點）';
    $('redeemBtn').hidden = false;
    $('redeemConfirm').hidden = true;
    // 規則文字一律依 garden.js 的 RULES 顯示
    $('redeemAsk').textContent = '確定用 ' + R.redeemPoints + ' 點兌換 ' + R.redeemValue + ' 元購物金嗎？';
    $('ruleRedeem').innerHTML = '每 <b>' + R.redeemPoints + ' 點</b>可兌換 <b>' + R.redeemValue + ' 元購物金</b>';

    const redeems = g.ledger.filter(e => e.reason === 'redeem').reverse();
    $('gRedeems').innerHTML = redeems.length
      ? '<div class="list-rows">' + redeems.map(e => '<div><span>' + shortDate(e.date) + '</span><span>' + e.value +
        ' 元購物金　<span class="code">' + e.code + '</span></span><span class="status">' + e.status + '</span></div>').join('') + '</div>'
      : '<p class="empty">還沒有兌換紀錄。</p>';

    const hist = g.ledger.slice(-10).reverse();
    $('gHistory').innerHTML = hist.length
      ? '<div class="list-rows">' + hist.map(e => '<div><span>' + shortDate(e.date) + '</span><span>' +
        (e.reason === 'redeem' ? '兌換購物金' : '完成運動') + '</span><span class="' + (e.delta > 0 ? 'plus">+' : 'minus">') + e.delta + '</span></div>').join('') + '</div>'
      : '<p class="empty">做完一次運動就會得到第一點。</p>';
  }

  function confirmRedeem() {
    $('redeemBtn').hidden = true;
    $('redeemConfirm').hidden = false;
    $('redeemYes').focus();
  }

  function doRedeem() {
    const R = GD.RULES;
    if (GD.balance(storage.listLedger()) < R.redeemPoints) { renderGarden(); return; }
    const code = GD.redeemCode();
    storage.addLedger({ date: new Date().toISOString(), delta: -R.redeemPoints, reason: 'redeem', value: R.redeemValue, code, status: '待核發' });
    renderGarden();
    voice.sfx.finish();
    voice.speak('兌換成功！請把兌換碼交給工作人員。', 3);
  }

  // ---------- 開始 ----------
  function selectGame(id) {
    S.game = GAMES[id];
    $('screen-play').dataset.game = id;
    if (!S.scenes[id]) S.scenes[id] = S.game.newScene($('scene'));
    S.scene = S.scenes[id];
    S.extractor = S.game.newExtractor();
  }

  async function startExercise(id, demo) {
    voice.unlock();
    selectGame(id);
    const G = S.game;
    S.demo = demo;
    clearTimeout(S.finishTimer);
    showScreen('play');
    setPhase('loading');
    S.scene.clearEffects();
    resetBasket();
    bubble('正在準備鏡頭…');

    if (demo) {
      S.source = G.newDemo();
    } else {
      overlay('正在準備動作偵測', '第一次使用約需 10～20 秒，請稍候。\n瀏覽器詢問是否允許使用攝影機時，請按「允許」。', [], true);
      try {
        S.camera = S.camera || new RCDD.CameraPose($('video'));
        S.camera.prefer = 'R';
        await Promise.all([S.camera.load(G.detector || 'pose'), S.camera.startCamera()]);
        S.source = S.camera;
      } catch (err) {
        if (S.camera) S.camera.stopCamera();
        showStartError(err);
        return;
      }
    }

    overlay(null);
    S.profile = demo ? null : storage.getProfile(G.cfg.id);
    S.tracker = null;
    S.smoother.reset();
    S.extractor.reset();
    S.paused = false;
    S.okSince = null;
    S.countdown = null;
    S.lastHintAt = performance.now() / 1000;
    S.startedAt = Date.now();
    buildCheckList();
    setPhase('check');
    say(G.checkVoice, 2);
    if (!S.running) {
      S.running = true;
      schedule();
    }
  }

  function showStartError(err) {
    const name = err && err.name;
    let title = '無法開始', text;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      title = '沒有取得攝影機權限';
      text = '請在網址列左邊的圖示中，把「攝影機」改成允許，再按「重試」。';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      title = '找不到攝影機';
      text = '請確認電腦有鏡頭，或外接鏡頭已經插好。';
    } else if (name === 'NotReadableError') {
      title = '攝影機正在被使用';
      text = '請關閉其他使用鏡頭的程式（例如視訊會議），再按「重試」。';
    } else if (name === 'NotSupportedError') {
      text = '這個瀏覽器不支援鏡頭，請改用 Chrome 或 Edge。';
    } else {
      title = '動作偵測載入失敗';
      text = '請確認網路連線正常，再按「重試」。';
    }
    voice.speak(title, 2);
    const id = S.game.id;
    overlay(title, text, [
      { label: '重試', primary: true, onClick: () => startExercise(id, false) },
      { label: '改用示範模式', onClick: () => startExercise(id, true) },
      { label: '回首頁', onClick: goHome }
    ]);
  }

  function stopSource() {
    S.running = false;
    if (S.camera) S.camera.stopCamera();
    voice.cancel();
    if (RCDD.music) RCDD.music.stopAll();
  }

  // 第一次玩先看說明；看過或跳過後，之後直接開始（卡片上可再按「看遊戲說明」）
  function beginWithIntro(id, demo, force) {
    voice.unlock();
    const G = GAMES[id];
    if (!force && storage.getSetting(G.seenKey, false)) { startExercise(id, demo); return; }
    S.game = G;
    S.demo = demo;
    showScreen('tutorial');
    RCDD.tutorial.open({
      game: G,
      onStart() {
        storage.setSetting(G.seenKey, true);
        startExercise(id, demo);
      }
    });
  }

  function goHome() {
    RCDD.tutorial.close();
    clearTimeout(S.finishTimer);
    clearInterval(S.restTimer);
    stopSource();
    overlay(null);
    setPhase('loading');
    showScreen('home');
  }

  // ---------- 每一張畫面 ----------
  // 網址加上 ?tick=interval 時改用計時器更新（給背景視窗測試用）
  const USE_INTERVAL = /[?&]tick=interval/.test(location.search);
  function schedule() {
    if (USE_INTERVAL) setTimeout(() => loop(performance.now()), 33);
    else requestAnimationFrame(loop);
  }

  function loop(nowMs) {
    if (!S.running) return;
    schedule();
    const G = S.game;
    const t = nowMs / 1000;
    let raw = null;
    try { raw = S.source.read(nowMs); } catch (e) { raw = null; }
    if (raw) {
      S.lm = S.smoother.smooth(raw);
      S.feat = S.extractor.extract(S.lm);
    } else {
      S.smoother.reset();
      S.lm = null;
      S.feat = null;
    }

    if (t - S.brightAt > 0.5) {
      S.brightAt = t;
      try { S.brightness = S.source.brightness(); } catch (e) { S.brightness = 255; }
    }

    if (!S.paused) {
      if (S.phase === 'check') updateCheck(S.feat, t);
      else if (S.phase === 'calibrate' || S.phase === 'game') handleEvents(S.tracker.update(S.feat, t), t);
    }
    if ((S.phase === 'game' || S.phase === 'calibrate') && S.tracker) G.updateHud(S, $);

    S.scene.draw(Object.assign({ source: S.source, feat: S.feat, mode: S.phase, now: nowMs }, G.drawParams(S)));
  }

  // ---------- 位置檢查 ----------
  function buildCheckList() {
    $('checkList').innerHTML = S.game.checks.map(c =>
      '<li id="chk-' + c.id + '"><span class="mark" aria-hidden="true">…</span><span class="txt">' + c.label + '</span></li>').join('');
    $('countdown').classList.add('waiting');
    $('countdownNum').textContent = '…';
    $('checkFoot').textContent = '全部確認後自動開始';
  }

  function updateCheck(f, t) {
    let firstFail = null;
    for (const c of S.game.checks) {
      const ok = c.test(f, S);
      const li = $('chk-' + c.id);
      li.classList.toggle('ok', ok);
      li.querySelector('.mark').textContent = ok ? '✓' : '…';
      if (!ok && !firstFail) firstFail = c;
    }

    if (firstFail) {
      const hint = typeof firstFail.hint === 'function' ? firstFail.hint(f, S) : firstFail.hint;
      S.okSince = null;
      if (S.countdown) {
        S.countdown = null;
        $('countdown').classList.add('waiting');
        $('countdownNum').textContent = '…';
        $('checkFoot').textContent = '全部確認後自動開始';
      }
      bubble(hint);
      if (t - S.lastHintAt > 7) {
        S.lastHintAt = t;
        voice.speak(hint, 1);
      }
      return;
    }

    if (S.okSince == null) S.okSince = t;
    if (!S.countdown && t - S.okSince > 1) {
      S.countdown = { start: t, shown: null };
      $('countdown').classList.remove('waiting');
      $('checkFoot').textContent = '很好，保持不動';
      bubble('很好！準備開始', true);
    }
    if (S.countdown) {
      const left = 3 - Math.floor(t - S.countdown.start);
      if (left <= 0) {
        S.countdown = null;
        voice.sfx.go();
        if (S.game.hasProfile(S.profile)) beginGame();
        else beginCalibration();
        return;
      }
      if (left !== S.countdown.shown) {
        S.countdown.shown = left;
        $('countdownNum').textContent = left;
        voice.sfx.beep();
        voice.speak(['', '一', '二', '三'][left], 3);
      }
    }
  }

  // ---------- 能力測量 ----------
  function beginCalibration() {
    const G = S.game;
    setPhase('calibrate');
    S.calib = [];
    S.tracker = G.newTracker({ calibrating: true });
    $('repsLabel').textContent = G.calibLabel;
    $('repsNow').textContent = '0';
    $('repsTotal').textContent = '/ ' + G.cfg.calibrationReps + ' ' + unitOf(G);
    if (S.source.isDemo) S.source.start(performance.now(), 0);
    say(G.calibIntro[0], 2, G.calibIntro[1]);
  }

  function finishCalibration() {
    const G = S.game;
    const old = storage.getProfile(G.cfg.id);
    const out = G.finishCalibration(S.calib, old);
    S.profile = out.profile;
    if (!S.demo) storage.saveProfile(G.cfg.id, S.profile);
    S.calibBaseline = S.tracker.baseline;
    setPhase('interlude');
    bubble('測量完成！', true);
    if (S.source.isDemo) S.source.idle();
    voice.speak(out.voice, 3);
    overlay(out.title, out.text, [
      { label: out.button, primary: true, onClick: () => { overlay(null); clearTimeout(S.finishTimer); beginGame(); } }
    ]);
    S.finishTimer = setTimeout(() => { overlay(null); beginGame(); }, 7000);
  }

  // ---------- 遊戲 ----------
  function beginGame() {
    if (S.phase === 'game') return;
    const G = S.game;
    setPhase('game');
    S.scores = [];
    S.finaleMs = 0;
    S.scene.clearEffects();
    resetBasket();
    G.onStartGame(ctx());
    S.tracker = G.newTracker({ calibrating: false, profile: S.profile, baseline: S.calibBaseline });
    S.calibBaseline = null;
    $('repsLabel').textContent = unitOf(G) === '回' ? '回數' : '次數';
    $('repsNow').textContent = '0';
    $('repsTotal').textContent = '/ ' + G.cfg.reps + ' ' + unitOf(G);
    $('scoreNow').textContent = '—';
    $('scoreStars').textContent = '';
    if (S.source.isDemo) S.source.start(performance.now(), G.cfg.calibrationReps);
    say(G.gameIntro[0], 2, G.gameIntro[1]);
  }

  function handleEvents(events, t) {
    const G = S.game;
    for (const e of events) {
      if (e.type === 'lost') {
        bubble('看不到您了，請坐回鏡頭前', true);
        if (t - S.lastLostAt > 6) { S.lastLostAt = t; voice.speak('看不到您了，請坐回鏡頭前', 2); }
        continue;
      }
      if (e.type === 'found') { bubble('很好，繼續'); continue; }

      if (S.phase === 'calibrate') {
        if (e.type === 'start' && G.calibStartBubble) bubble(G.calibStartBubble);
        if (e.type === 'rep') {
          S.calib.push(G.onCalibRep(e, ctx()));
          $('repsNow').textContent = S.calib.length;
          if (S.calib.length >= G.cfg.calibrationReps) { finishCalibration(); return; }
          const [full, short] = G.calibRepSay(e, S.calib.length);
          say(full, 2, short);
        } else if (G.onCalibEvent) {
          G.onCalibEvent(e, ctx());
        }
        continue;
      }

      if (e.type === 'rep') {
        onGameRep(e);
        if (S.phase !== 'game') return;
      } else {
        G.onEvent(e, ctx());
      }
    }
  }

  function onGameRep(e) {
    const G = S.game;
    S.scores.push(e.score);
    const n = S.scores.length;
    $('repsNow').textContent = n;
    const avg = Math.round(S.scores.reduce((s, x) => s + x.total, 0) / n);
    $('scoreNow').textContent = avg;
    $('scoreStars').textContent = '★'.repeat(EX.starsFor(avg));
    G.onRep(e, ctx());

    if (n >= G.cfg.reps) {
      setPhase('ending');
      bubble('全部完成了！', true);
      // 遊戲若要在結尾演奏（例如把歌彈完），多等一下再結算
      S.finishTimer = setTimeout(() => finishSession('done'), 1600 + (S.finaleMs || 0));
    }
  }

  function basketPoint() {
    const b = $('basket').getBoundingClientRect();
    const c = $('scene').getBoundingClientRect();
    const n = $('basket').children.length;
    return { x: b.left - c.left + 12 + (n % 10) * 28, y: b.top - c.top + 14 };
  }

  function resetBasket() { $('basket').innerHTML = ''; }
  function addBasket(cls) {
    const i = document.createElement('i');
    if (cls) i.className = cls;
    $('basket').appendChild(i);
  }

  // ---------- 結束與結算 ----------
  function finishSession(reason) {
    clearTimeout(S.finishTimer);
    clearInterval(S.restTimer);
    const G = S.game;
    const painStop = reason === 'pain';
    const sum = G.summarize(S.scores);
    const prev = storage.listSessions().filter(s => !s.demo && s.reps > 0 && s.exercise === G.cfg.id).pop() || null;
    const record = Object.assign({
      date: new Date().toISOString(),
      exercise: G.cfg.id,
      demo: S.demo,
      reps: sum.reps,
      total: sum.total,
      parts: sum.parts,
      faultCounts: sum.faultCounts,
      painStop,
      durationSec: Math.round((Date.now() - S.startedAt) / 1000)
    }, G.record(sum));
    if (S.profile && S.profile.target) record.target = S.profile.target;
    // 花園澆水：今天第一次有效運動才澆水
    const before = gardenState();
    const watered = !S.demo && sum.reps > 0 && !storage.doneToday();
    if (sum.reps > 0 || painStop) storage.addSession(record);
    // 集點
    const pts = GD.pointsFor({ demo: S.demo, reps: sum.reps, reason }, before.ledger);
    if (pts > 0) storage.addLedger({ date: record.date, delta: pts, reason: 'session' });
    const after = gardenState();
    const reward = {
      demo: S.demo,
      watered,
      bloomed: watered && after.grow.flowers > before.grow.flowers,
      points: pts,
      capped: !pts && GD.earnsPoint({ demo: S.demo, reps: sum.reps, reason }),
      balance: after.points,
      canRedeem: pts > 0 && after.points >= GD.RULES.redeemPoints && before.points < GD.RULES.redeemPoints
    };
    stopSource();
    overlay(null);
    renderResult(record, sum, prev, reward);
    showScreen('result');
  }

  const STAR = '<path d="M0,-1 L.247,-.34 L.951,-.309 L.399,.13 L.588,.809 L0,.42 L-.588,.809 L-.399,.13 L-.951,-.309 L-.247,-.34Z" transform="translate(50 54) scale(46)"/>';

  function renderRewards(r) {
    const pills = [];
    if (r.demo) pills.push(['muted', '示範模式不集點']);
    if (r.bloomed) pills.push(['big', '花園開花了！']);
    else if (r.watered) pills.push(['', '花園澆水 +1']);
    if (r.points) pills.push(['points', '集點 +' + r.points + '，共 ' + r.balance + ' 點']);
    else if (r.capped) pills.push(['muted', '今天的 ' + GD.RULES.dailyCap + ' 點已經集滿了']);
    if (r.canRedeem) pills.push(['big', '可以兌換 ' + GD.RULES.redeemValue + ' 元購物金了！']);
    $('resRewards').innerHTML = pills.map(([cls, text]) => '<span class="reward ' + cls + '">' + text + '</span>').join('');
    let speech = '';
    if (r.bloomed) speech += '花園的花開了！';
    else if (r.watered) speech += '幫花園澆了水。';
    if (r.points) speech += '得到 ' + r.points + ' 點，現在一共 ' + r.balance + ' 點。';
    if (r.canRedeem) speech += '可以兌換購物金了！';
    return speech;
  }

  function renderResult(rec, sum, prev, reward) {
    const G = S.game;
    const pain = rec.painStop;
    const stars = sum.reps ? EX.starsFor(sum.total) : 0;
    const res = sum.reps ? G.result(sum, prev, S.profile) : { sub: '', chip: '', speech: '' };
    $('resTitle').textContent = pain ? '先休息一下' : (stars === 3 ? '太棒了！' : stars === 2 ? '做得很好！' : '辛苦了！');
    $('resSub').textContent = pain ? '已記錄這次的疼痛。如果一直會痛，請告訴家人或治療師。' : res.sub;
    $('resStars').innerHTML = [1, 2, 3].map(i =>
      '<svg viewBox="0 0 100 100" class="' + (i === 2 ? 'mid' : '') + '"><g fill="' + (i <= stars ? '#F2B33D' : '#E6EBE7') + '">' + STAR + '</g></svg>').join('');
    $('resTotal').textContent = sum.total;
    $('ringFg').setAttribute('stroke-dasharray', (880 * sum.total / 100).toFixed(1) + ' 880');

    $('resBars').innerHTML = G.bars(sum).map(([label, v, max, color]) =>
      '<div class="bar-row"><span>' + label + '</span><div class="bar-track"><div class="bar-fill" style="width:' +
      (100 * v / max).toFixed(0) + '%;background:' + color + '"></div></div><span class="bar-val">' + v + ' / ' + max + '</span></div>').join('');

    let chip = res.chip;
    const note = sum.reps ? noteFor(Object.assign({ exercise: G.cfg.id }, sum)) : '';
    if (note) chip += '　提醒：' + note;
    $('resChip').textContent = chip;
    const rewardSpeech = renderRewards(reward || {});

    if (pain) voice.speak('好，我們先休息。如果一直會痛，請告訴家人或治療師。' + rewardSpeech, 3);
    else if (sum.reps) {
      voice.sfx.finish();
      voice.speak($('resTitle').textContent + res.speech + '，總分 ' + sum.total + ' 分。' + rewardSpeech, 3);
    }
  }

  // ---------- 暫停、疼痛 ----------
  function pause() {
    if (S.phase !== 'game' && S.phase !== 'calibrate') return;
    S.paused = true;
    if (RCDD.music) RCDD.music.stopAll();
    voice.speak('暫停了，休息一下', 2);
    overlay('暫停中', '休息好了再按「繼續」。', [
      { label: '繼續', primary: true, onClick: resume },
      { label: '結束這次運動', onClick: () => (S.scores.length ? finishSession('stopped') : goHome()) }
    ]);
  }
  function resume() {
    const G = S.game;
    overlay(null);
    S.paused = false;
    if (S.tracker) S.tracker.reset();
    if (S.source && S.source.isDemo) S.source.start(performance.now(), S.phase === 'game' ? G.cfg.calibrationReps + S.scores.length : S.calib.length);
    if (S.phase === 'game' && G.onResume) G.onResume(ctx());
    say('好，繼續。把手放下來，準備下一下', 2, '把手放下，準備下一下');
  }

  // ---------- 綁定按鈕 ----------
  function init() {
    selectGame('apple');
    window.addEventListener('resize', () => S.scene && S.scene.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && !USE_INTERVAL) pause(); });

    const voiceOn = storage.getSetting('voice', true);
    voice.setEnabled(voiceOn);
    const vb = $('voiceBtn');
    const syncVoice = () => {
      vb.textContent = '語音引導：' + (voice.isEnabled() ? '開' : '關');
      vb.setAttribute('aria-pressed', String(voice.isEnabled()));
    };
    syncVoice();
    vb.addEventListener('click', () => {
      voice.setEnabled(!voice.isEnabled());
      storage.setSetting('voice', voice.isEnabled());
      syncVoice();
    });

    // 每張遊戲卡片：開始、看遊戲說明、示範試玩
    document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => beginWithIntro(b.dataset.start, false)));
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => beginWithIntro(b.dataset.help, false, true)));
    document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => beginWithIntro(b.dataset.demo, true)));

    $('gardenCard').addEventListener('click', () => showScreen('garden'));
    $('ptGo').addEventListener('click', () => showScreen('garden'));
    document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { statsRange = ST.preset(b.dataset.range); renderStats(); }));
    $('statsFrom').addEventListener('change', onStatsDate);
    $('statsTo').addEventListener('change', onStatsDate);
    $('redeemBtn').addEventListener('click', confirmRedeem);
    $('redeemYes').addEventListener('click', doRedeem);
    $('redeemNo').addEventListener('click', renderGarden);
    $('recalBtn').addEventListener('click', () => {
      for (const g of Object.values(GAMES)) storage.resetProfile(g.cfg.id);
      renderHome();
      $('profileNote').textContent = '下次開始時會重新做能力測量。';
    });
    $('topHomeBtn').addEventListener('click', goHome);
    $('resHomeBtn').addEventListener('click', goHome);
    $('againBtn').addEventListener('click', () => startExercise(S.game.id, S.demo));
    $('pauseBtn').addEventListener('click', pause);
    $('painBtn').addEventListener('click', () => {
      if (S.phase === 'game' || S.phase === 'calibrate' || S.phase === 'interlude') finishSession('pain');
      else { voice.speak('好，我們先休息', 3); goHome(); }
    });

    showScreen('home');
    // 先在背景下載偵測模型，按開始時比較快
    if (RCDD.preloadPose) setTimeout(() => RCDD.preloadPose().catch(() => {}), 1500);
  }

  init();
})();
