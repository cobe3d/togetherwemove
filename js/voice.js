// 語音提示（中文）與音效
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const synth = root.speechSynthesis || null;

  let zhVoice = null;
  let enabled = true;
  let currentPriority = 0;

  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) ||
      vs.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) ||
      vs.find(v => /^zh/i.test(v.lang)) || null;
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  // priority 越高越重要；正在說更重要的話時，不重要的提示會被略過
  // 語音合成容易唸錯的破音字：只改唸出來的文字，畫面上的字不變
  // 「彈」在遊戲裡都是彈琴的 ㄊㄢˊ，語音常唸成子彈的 ㄉㄢˋ，改用同音的「談」
  const SAY_AS = [['彈', '談']];
  function forSpeech(text) {
    return SAY_AS.reduce((s, [from, to]) => s.split(from).join(to), text);
  }

  function speak(text, priority) {
    if (!enabled || !synth || !text) return;
    const p = priority || 1;
    const busy = synth.speaking || synth.pending;
    if (busy && p < currentPriority) return;
    if (busy) synth.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = zhVoice ? zhVoice.lang : 'zh-TW';
    if (zhVoice) u.voice = zhVoice;
    u.rate = 0.9;
    u.pitch = 1.05;
    currentPriority = p;
    u.onend = u.onerror = () => { currentPriority = 0; };
    synth.speak(u);
  }

  function cancel() {
    if (synth) synth.cancel();
    currentPriority = 0;
  }

  // 音效：瀏覽器規定要在使用者按下按鈕後才能發聲
  let actx = null;
  function unlock() {
    try {
      actx = actx || new (root.AudioContext || root.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function tone(freq, dur, when, gain) {
    if (!actx) return;
    const t = actx.currentTime + (when || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  const sfx = {
    pick() { tone(784, 0.18); tone(1047, 0.22, 0.12); tone(1319, 0.35, 0.24); },
    drop() { tone(523, 0.18); tone(659, 0.25, 0.1); },
    beep() { tone(660, 0.15, 0, 0.15); },
    go() { tone(880, 0.35, 0, 0.2); },
    finish() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, i * 0.13, 0.18)); }
  };

  RCDD.voice = {
    speak,
    cancel,
    unlock,
    sfx,
    audioContext: () => actx,
    forSpeech,
    isEnabled: () => enabled,
    setEnabled(v) { enabled = !!v; if (!enabled) cancel(); }
  };
})(window);
