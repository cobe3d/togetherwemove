// 雙手聯彈畫面：兩隻張開的手、要彎的手指亮起、彎對變綠／彎錯變紅、兩個八度的琴鍵
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const TIP = { T: 4, I: 8, M: 12, R: 16, P: 20 };
  const NAME = { T: '拇指', I: '食指', M: '中指', R: '無名指', P: '小指' };
  const HAND = { L: '左手', R: '右手' };
  const CHORD_COLOR = '#6C8FB3';
  const SOLFA_CHORD = { C: 'Do', F: 'Fa', G: 'Sol' };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  class DuetScene extends RCDD.PianoScene {
    constructor(canvas) {
      super(canvas);
      this.keys = RCDD.music.DUET_KEYS;
      this.tipPos = null;
    }

    // 彎對一下：右手亮旋律鍵、左手亮和弦鍵
    pressDuet(res, finger) {
      const now = performance.now();
      const color = RCDD.FINGER_COLOR[finger] || '#F2B33D';
      if (res.melody) this.keyHits[res.melody] = { t: now, c: color };
      for (const k of res.chord) this.keyHits[k] = { t: now, c: CHORD_COLOR };
      const p = this.tipPos;
      if (p) {
        this.bursts.push({ x: p.x, y: p.y, t: now, c: res.melody ? color : CHORD_COLOR });
        const label = res.melody ? (RCDD.music.SOLFA[res.melody] || '') : (res.chordName ? SOLFA_CHORD[res.chordName] + ' 和弦' : '');
        if (label) this.floatText('♪ ' + label, { x: p.x, y: p.y - 40 });
      }
    }

    draw(fr) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const src = fr.source;
      this.layout(src.width, src.height);
      if (src.isDemo) this.drawRoom();
      else this.drawVideo(src.video, src.width, src.height);
      ctx.fillStyle = 'rgba(8,18,14,0.16)';
      ctx.fillRect(0, 0, this.w, this.h);

      const f = fr.feat;
      if (f) {
        const P = { L: f.hands.L.points.map(p => this.map(p)), R: f.hands.R.points.map(p => this.map(p)) };
        const palm = f.palm * this.s;
        if (src.isDemo) { this.drawDemoHand(P.L, palm); this.drawDemoHand(P.R, palm); }
        if (fr.mode === 'check') {
          const all = {};
          P.L.concat(P.R).forEach((p, i) => { all['p' + i] = p; });
          this.drawBrackets(all, '#7CF0B0');
        }
        this.drawHandLines(P.L);
        this.drawHandLines(P.R);
        const playing = fr.mode === 'game' || fr.mode === 'calibrate';
        for (const h of ['L', 'R']) this.drawFingers(h, P[h], f.hands[h].bend, palm, playing ? fr.step : null, fr.phase, fr.thr, fr.now);
        // 每隻手的外側（小指那一邊）標出左手／右手
        for (const h of ['L', 'R']) {
          const out = P[h][17].x < P[h][5].x ? -1 : 1;
          RCDD.pianoPill(ctx, P[h][17].x + out * palm * 0.75, P[h][0].y - palm * 0.2, HAND[h],
            playing && fr.step && fr.step.hand === h ? '#FFE08A' : 'rgba(0,0,0,0.4)', playing && fr.step && fr.step.hand === h ? '#4A3300' : '#FFFFFF', 22);
        }
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      if (fr.mode !== 'check') this.drawKeyboard(fr.now);
      this.drawBursts(fr.now);
      this.drawEffects(fr.now);
    }

    drawFingers(h, P, bend, palm, step, phase, thr, now) {
      const ctx = this.ctx;
      const r = clamp(palm * 0.1, 9, 30);
      const COLOR = RCDD.FINGER_COLOR;
      const target = step && step.hand === h ? step.f : null;
      for (const k of ['T', 'I', 'M', 'R', 'P']) {
        const p = P[TIP[k]];
        const lit = target === k;
        const bent = bend[k] >= (thr || 0.5);
        if (lit) {
          this.tipPos = p;
          const pulse = 1 + 0.12 * Math.sin(now / 150);
          ctx.save();
          ctx.shadowColor = COLOR[k];
          ctx.shadowBlur = 22;
          ctx.strokeStyle = phase === 'release' ? '#7CF0B0' : '#FFE08A';
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 2 * pulse, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          RCDD.pianoPill(ctx, p.x, p.y - r * 3 - 10, phase === 'release' ? '伸直回來' : '彎' + NAME[k], COLOR[k], '#FFFFFF', 22);
        } else if (bent && step) {
          // 彎錯的手指標紅色
          ctx.strokeStyle = '#E0412F';
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = lit ? 1 : 0.75;
        ctx.fillStyle = lit && phase === 'release' ? '#7CF0B0' : COLOR[k];
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, lit ? r * 1.1 : r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  RCDD.DuetScene = DuetScene;
})(window);
