// 打鼓遊戲的音樂：〈兩隻老虎〉旋律（法國傳統民謠〈Frère Jacques〉，公共領域；只用旋律、不含歌詞）與鼓聲
// 每拍到一下鼓，就往下演奏一句。
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  // 1 = F，逗號表示低八度。[音, 拍數]；每句一小節（4 拍）
  const FREQ = { '5,': 261.63, '1': 349.23, '2': 392.0, '3': 440.0, '4': 466.16, '5': 523.25, '6': 587.33 };
  const PHRASES = [
    [['1', 1], ['2', 1], ['3', 1], ['1', 1]],
    [['1', 1], ['2', 1], ['3', 1], ['1', 1]],
    [['3', 1], ['4', 1], ['5', 2]],
    [['3', 1], ['4', 1], ['5', 2]],
    [['5', 0.5], ['6', 0.5], ['5', 0.5], ['4', 0.5], ['3', 1], ['1', 1]],
    [['5', 0.5], ['6', 0.5], ['5', 0.5], ['4', 0.5], ['3', 1], ['1', 1]],
    [['1', 1], ['5,', 1], ['1', 2]],
    [['1', 1], ['5,', 1], ['1', 2]]
  ];

  let master = null;
  const live = new Set();

  function ctx() {
    RCDD.voice.unlock();
    const c = RCDD.voice.audioContext();
    if (c && !master) {
      master = c.createGain();
      master.gain.value = 0.9;
      master.connect(c.destination);
    }
    return c;
  }

  function note(c, freq, start, dur, vol) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.09 * vol, start + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.98);
    g.connect(master);
    for (const [type, mult, amp] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult, start);
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(start);
      o.stop(start + dur + 0.05);
      live.add(o);
      o.onended = () => live.delete(o);
    }
  }

  // 演奏第 index 句，整句長度約 seconds 秒；前一句還沒彈完就先停掉
  function playPhrase(index, seconds, vol) {
    const c = ctx();
    if (!c) return;
    stopAll();
    vol = vol == null ? 1 : vol;
    const ph = PHRASES[((index % PHRASES.length) + PHRASES.length) % PHRASES.length];
    const beats = ph.reduce((s, n) => s + n[1], 0);
    const k = seconds / beats;
    let t = c.currentTime + 0.05;
    for (const [deg, b] of ph) {
      note(c, FREQ[deg], t, b * k, vol);
      t += b * k;
    }
  }

  // 太鼓聲：side 讓左右兩面鼓音高略有不同
  function drum(side, soft) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator(), g = c.createGain();
    const base = side === 'L' ? 140 : 120;
    o.type = 'sine';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.42, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(soft ? 0.35 : 0.8, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.5);
    // 鼓皮的「啪」聲
    const len = Math.floor(c.sampleRate * 0.06);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = 1200;
    ng.gain.value = soft ? 0.12 : 0.25;
    src.connect(f).connect(ng).connect(master);
    src.start(t);
  }

  // ---------- 彈鋼琴：〈小星星〉----------
  // 旋律是 1761 年出版的法國歌〈Ah! vous dirai-je, maman〉，作者不詳，屬公共領域；只用旋律、不含歌詞。
  // 1 = C。每碰一下手指，就彈下一個音。
  const PIANO_FREQ = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25
  };
  const PIANO_KEYS = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const SOLFA = { C4: 'Do', D4: 'Re', E4: 'Mi', F4: 'Fa', G4: 'Sol', A4: 'La' };
  const LINE_A = ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'];
  const LINE_B = ['G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4'];
  const SONG = [...LINE_A, ...LINE_B, ...LINE_B, ...LINE_A];   // 共 42 個音

  function piano(name, vol) {
    const c = ctx();
    if (!c || !PIANO_FREQ[name]) return;
    vol = vol == null ? 1 : vol;
    const t = c.currentTime + 0.01;
    const f = PIANO_FREQ[name];
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.08 * vol, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(master);
    // 基音加泛音，聽起來像鋼琴
    for (const [mult, amp, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.05, 'sine']]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * mult * (mult === 2 ? 1.002 : 1), t);
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  // 完成一回：Do Mi Sol 和弦
  function pianoChord() {
    ['C4', 'E4', 'G4'].forEach(n => piano(n, 0.5));
  }

  // 結束時自動把這首歌剩下的音彈完；回傳彈完要幾毫秒
  function pianoFinish(fromIdx, onNote) {
    const rest = (SONG.length - (fromIdx % SONG.length)) % SONG.length;
    for (let i = 0; i < rest; i++) {
      setTimeout(() => {
        const note = SONG[(fromIdx + i) % SONG.length];
        piano(note, 0.8);
        if (onNote) onNote(note);
      }, i * 380);
    }
    return rest * 380;
  }

  // ---------- 雙手聯彈：〈小星星〉旋律＋左手和弦自動伴奏 ----------
  // 只用 Do（C）、Fa（F）、Sol（G）三個大和弦，都放在低一個八度
  const DUET_KEYS = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const CHORDS = { C: ['C3', 'E3', 'G3'], F: ['C3', 'F3', 'A3'], G: ['D3', 'G3', 'B3'] };
  const CHORD_A = ['C', 'C', 'C', 'C', 'F', 'F', 'C', 'F', 'F', 'C', 'C', 'G', 'G', 'C'];
  const CHORD_B = ['C', 'C', 'F', 'F', 'C', 'C', 'G'];
  const SONG_CHORDS = [...CHORD_A, ...CHORD_B, ...CHORD_B, ...CHORD_A];

  // 彈第 idx 個音；和弦換了、或每兩個音，左手就彈一次和弦。回傳彈了哪些鍵
  function duetNote(idx, vol) {
    const i = idx % SONG.length;
    const melody = SONG[i];
    const name = SONG_CHORDS[i];
    const playChord = i === 0 || name !== SONG_CHORDS[i - 1] || i % 2 === 0;
    piano(melody, vol);
    const chord = playChord ? CHORDS[name] : [];
    chord.forEach(k => piano(k, (vol == null ? 1 : vol) * 0.45));
    return { melody, chord, chordName: name };
  }

  // 右手彎下：彈第 idx 個旋律音
  function duetMelody(idx, vol) {
    const melody = SONG[idx % SONG.length];
    piano(melody, vol);
    return { melody, chord: [], chordName: null };
  }

  // 左手彎下：彈第 idx 個旋律音要配的和弦
  function duetChord(idx, vol) {
    const name = SONG_CHORDS[idx % SONG.length];
    const chord = CHORDS[name];
    chord.forEach(k => piano(k, (vol == null ? 1 : vol) * 0.55));
    return { melody: null, chord, chordName: name };
  }

  // 結束時把歌彈完，最後加一個 Do 大和弦收尾；回傳要幾毫秒
  function duetFinish(fromIdx, onNote) {
    const rest = (SONG.length - (fromIdx % SONG.length)) % SONG.length;
    for (let i = 0; i < rest; i++) {
      setTimeout(() => onNote && onNote(duetNote(fromIdx + i, 0.8)), i * 420);
    }
    setTimeout(() => {
      ['C3', 'E3', 'G3', 'C4', 'E4', 'G4'].forEach(k => piano(k, 0.45));
      if (onNote) onNote({ melody: 'C4', chord: ['C3', 'E3', 'G3', 'E4', 'G4'], chordName: 'C' });
    }, rest * 420 + 200);
    return rest * 420 + 1400;
  }

  // ---------- 騎腳踏車背景音樂：〈丟丟銅仔〉（宜蘭傳統民謠；只用旋律、不含歌詞）----------
  // 依國小直笛教材的唱名譜轉成 1=F；[音, 拍數]
  const LOOP_FREQ = { G3: 196.0, C4: 261.63, D4: 293.66, F4: 349.23, G4: 392.0, A4: 440.0 };
  const DIUDIU = [
    ['G4', 1], ['A4', 1], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['G4', 1],
    ['F4', 0.5], ['D4', 0.5], ['C4', 1], ['D4', 0.5], ['F4', 0.5], ['C4', 2],
    ['D4', 1], ['G4', 1], ['D4', 0.5], ['F4', 0.5], ['F4', 0.5], ['D4', 0.5], ['G4', 1],
    ['G4', 0.5], ['G4', 0.5], ['D4', 0.5], ['F4', 0.5], ['F4', 0.5], ['D4', 0.5],
    ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['F4', 0.5], ['D4', 1],
    ['C4', 1], ['G3', 1], ['D4', 1], ['C4', 2], ['', 1]
  ];
  let loopTimer = null;

  // 一直重複播放，直到 stopLoop
  function startLoop(vol, bpm) {
    stopLoop();
    const c = ctx();
    if (!c) return;
    const beat = 60 / (bpm || 104);
    let i = 0, next = c.currentTime + 0.15;
    loopTimer = setInterval(() => {
      while (next < c.currentTime + 0.4) {
        const [n, b] = DIUDIU[i % DIUDIU.length];
        if (n) note(c, LOOP_FREQ[n], next, b * beat * 0.95, vol == null ? 0.5 : vol);
        next += b * beat;
        i++;
      }
    }, 100);
  }
  function stopLoop() {
    clearInterval(loopTimer);
    loopTimer = null;
  }

  // 腳踏車鈴「叮鈴」
  function bell() {
    const c = ctx();
    if (!c) return;
    for (const [f, d] of [[2093, 0], [2637, 0.12], [2093, 0.24], [2637, 0.36]]) {
      const t = c.currentTime + 0.02 + d;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.55);
    }
  }

  // ---------- 踢足球：踢球聲、哨音、觀眾歡呼（沒有旋律）----------
  let noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  // 「碰」一聲踢到球
  function kick() {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.25);
  }

  // 裁判哨音：long = 長哨（比賽結束）
  function whistle(long) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + 0.02;
    const dur = long ? 1.1 : 0.45;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2900, t);
    lfo.frequency.value = 28;          // 哨子裡小球滾動的顫音
    lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.setValueAtTime(0.09, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // 觀眾聲：cheer = 進球歡呼；否則是「喔～」的可惜聲
  function crowd(cheer) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + 0.02;
    const dur = cheer ? 2.2 : 1.1;
    const src = noise(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(cheer ? 900 : 500, t);
    bp.frequency.linearRampToValueAtTime(cheer ? 1400 : 300, t + dur);
    const g = c.createGain();
    const peak = cheer ? 0.35 : 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (cheer ? 0.25 : 0.15));
    g.gain.setValueAtTime(peak, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
    live.add(src);
    src.onended = () => live.delete(src);
  }
  const cheer = () => crowd(true);
  const groan = () => crowd(false);

  function stopAll() {
    stopLoop();
    for (const o of live) { try { o.stop(); } catch (e) { /* 已停止 */ } }
    live.clear();
  }

  RCDD.music = {
    PHRASES, playPhrase, drum, stopAll, phraseCount: PHRASES.length,
    SONG, SOLFA, PIANO_KEYS, piano, pianoChord, pianoFinish,
    DUET_KEYS, SONG_CHORDS, duetNote, duetMelody, duetChord, duetFinish,
    DIUDIU, startLoop, stopLoop, bell,
    kick, whistle, cheer, groan
  };
})(window);
