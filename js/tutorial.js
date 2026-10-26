// 遊戲說明：用示範動畫介紹玩法、計分規則與注意事項
// 每個遊戲的步驟文字與示範動畫寫在 js/games/*.js 的 tutorial。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const $ = id => document.getElementById(id);
  const USE_INTERVAL = /[?&]tick=interval/.test(location.search);

  const T = { open: false, step: 0, steps: [], sim: null, handlers: null, stepStart: 0, stepDur: 0, ready: false };

  function schedule() {
    if (USE_INTERVAL) setTimeout(() => frame(performance.now()), 33);
    else requestAnimationFrame(frame);
  }

  function init() {
    T.ready = true;
    window.addEventListener('resize', () => { if (T.open && T.sim) T.sim.scene.resize(); });
    $('tutPrev').addEventListener('click', () => go(T.step - 1));
    $('tutNext').addEventListener('click', next);
    $('tutReplay').addEventListener('click', () => go(T.step));
    $('tutSkip').addEventListener('click', finish);
  }

  function open(handlers) {
    if (!T.ready) init();
    const tut = handlers.game.tutorial;
    T.handlers = handlers;
    T.steps = tut.steps;
    T.open = true;
    $('screen-tutorial').dataset.game = handlers.game.id;
    $('tutDots').innerHTML = T.steps.map((s, i) => '<li><span>' + (i + 1) + '</span>' + s.label + '</li>').join('');
    $('tutBasketLabel').textContent = tut.basketLabel;
    $('tutBasket').innerHTML = '';
    T.sim = tut.makeSim($('tutScene'), $('tutBasket'));
    T.sim.scene.resize();
    go(0);
    schedule();
  }

  function close() {
    if (!T.open) return;
    T.open = false;
    RCDD.voice.cancel();
    if (RCDD.music) RCDD.music.stopAll();
  }

  function go(i) {
    T.step = Math.max(0, Math.min(T.steps.length - 1, i));
    const s = T.steps[T.step];
    const last = T.step === T.steps.length - 1;
    $('tutTitle').textContent = s.title;
    $('tutBody').innerHTML = s.html;
    $('tutCaption').textContent = s.caption;
    $('tutPrev').disabled = T.step === 0;
    $('tutNext').textContent = last ? '我知道了，開始' : '下一步';
    $('tutSkip').hidden = last;
    [...$('tutDots').children].forEach((li, k) => {
      li.classList.toggle('active', k === T.step);
      li.classList.toggle('done', k < T.step);
    });
    RCDD.voice.speak(s.voice, 3);
    // 依旁白長度自動翻到下一步；最後一步等長輩自己按開始
    T.stepStart = performance.now();
    T.stepDur = last ? 0 : (s.voice.length * 0.27 + 3) * 1000;
  }

  function next() {
    if (T.step === T.steps.length - 1) finish();
    else go(T.step + 1);
  }

  function finish() {
    const h = T.handlers;
    close();
    if (h && h.onStart) h.onStart();
  }

  function frame(now) {
    if (!T.open) return;
    schedule();
    const bar = $('tutProgress');
    if (T.stepDur) {
      const u = (now - T.stepStart) / T.stepDur;
      bar.style.width = (Math.min(u, 1) * 100).toFixed(1) + '%';
      if (u >= 1) next();
    } else {
      bar.style.width = '100%';
    }
    if (T.open) T.sim.frame(now);
  }

  RCDD.tutorial = { open, close, isOpen: () => T.open };
})(window);
