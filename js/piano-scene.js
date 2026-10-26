// 彈鋼琴遊戲畫面：手部骨架、亮起的指尖、下方琴鍵
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const TIP = { I: 8, M: 12, R: 16, P: 20 };
  const COLOR = { T: '#9C7BD3', I: '#E0412F', M: '#F2B33D', R: '#4C9C62', P: '#4F9BD9' };
  const NAME = { T: '拇指', I: '食指', M: '中指', R: '無名指', P: '小指' };
  const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  class PianoScene extends RCDD.AppleScene {
    constructor(canvas) {
      super(canvas);
      this.keyHits = {};
      this.bursts = [];
      this.thumbPos = null;
      this.kbBottom = 128;   // 琴鍵離畫面底部的距離（讓出底部按鈕列）
    }

    clearEffects() {
      super.clearEffects();
      this.keyHits = {};
      this.bursts = [];
    }

    // 碰到一下：琴鍵亮起、指尖冒出音名
    press(note, finger, label) {
      this.keyHits[note] = { t: performance.now(), c: COLOR[finger] || '#F2B33D' };
      const p = this.thumbPos;
      if (p) {
        this.bursts.push({ x: p.x, y: p.y, t: performance.now(), c: COLOR[finger] || '#FFE08A' });
        this.floatText('♪ ' + label, { x: p.x, y: p.y - 30 });
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
        const P = f.points.map(p => this.map(p));
        const palm = f.palm * this.s;
        this.thumbPos = P[4];
        if (src.isDemo) this.drawDemoHand(P, palm);
        if (fr.mode === 'check') this.drawBrackets(P.reduce((o, p, i) => (o['p' + i] = p, o), {}), '#7CF0B0');
        this.drawHandLines(P);
        const playing = fr.mode === 'game' || fr.mode === 'calibrate';
        if (playing && fr.target && !fr.pending) this.drawTargetLine(P, fr.target, palm);
        this.drawTips(P, palm, playing ? fr.target : null, fr.contact, fr.now, fr.pending);
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      if (fr.mode !== 'check') this.drawKeyboard(fr.now);
      this.drawBursts(fr.now);
      this.drawEffects(fr.now);
    }

    drawDemoHand(P, palm) {
      const ctx = this.ctx;
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath();
      for (const [i, k] of [0, 1, 5, 9, 13, 17].entries()) {
        if (i === 0) ctx.moveTo(P[k].x, P[k].y); else ctx.lineTo(P[k].x, P[k].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#F1C9A5';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const chain of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
        ctx.lineWidth = palm * (chain[0] === 17 ? 0.17 : 0.21);
        ctx.beginPath();
        ctx.moveTo(P[chain[0]].x, P[chain[0]].y);
        for (const k of chain.slice(1)) ctx.lineTo(P[k].x, P[k].y);
        ctx.stroke();
      }
      // 手腕、袖子
      ctx.strokeStyle = '#F1C9A5';
      ctx.lineWidth = palm * 0.55;
      ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[0].x + (P[0].x - P[9].x) * 0.5, P[0].y + palm * 0.6); ctx.stroke();
      ctx.strokeStyle = '#6C8FB3';
      ctx.lineWidth = palm * 0.75;
      ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y + palm * 0.7); ctx.lineTo(P[0].x + (P[0].x - P[9].x) * 0.9, P[0].y + palm * 2); ctx.stroke();
    }

    drawHandLines(P) {
      const ctx = this.ctx;
      ctx.strokeStyle = 'rgba(124,240,176,0.9)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of LINKS) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); }
      ctx.stroke();
      ctx.fillStyle = '#7CF0B0';
      for (const p of P) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }

    drawTargetLine(P, target, palm) {
      const ctx = this.ctx;
      const a = P[4], b = P[TIP[target]];
      ctx.save();
      ctx.setLineDash([10, 9]);
      ctx.strokeStyle = 'rgba(255,224,138,0.85)';
      ctx.lineWidth = Math.max(3, palm * 0.03);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    }

    drawTips(P, palm, target, contact, now, pending) {
      const ctx = this.ctx;
      const r = clamp(palm * 0.1, 10, 34);
      for (const k of ['I', 'M', 'R', 'P']) {
        const p = P[TIP[k]];
        const lit = target === k && !pending;
        if (lit) {
          const pulse = 1 + 0.12 * Math.sin(now / 150);
          ctx.save();
          ctx.shadowColor = COLOR[k];
          ctx.shadowBlur = 22;
          ctx.strokeStyle = '#FFE08A';
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 2 * pulse, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = lit || contact === k ? 1 : 0.7;
        ctx.fillStyle = COLOR[k];
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, lit ? r * 1.1 : r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
        if (lit) pill(ctx, p.x, p.y - r * 2.6 - 16, NAME[k], COLOR[k], '#FFFFFF', 24);
      }
      // 拇指
      const t = P[4];
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#1F2A24';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    drawKeyboard(now) {
      const ctx = this.ctx;
      const keys = this.keys || RCDD.music.PIANO_KEYS;
      const solfa = RCDD.music.SOLFA;
      const kw = clamp(Math.min(this.w * 0.55, 560) / keys.length, 32, 62);
      const kh = kw * 1.35;
      const x0 = (this.w - kw * keys.length) / 2;
      const y0 = this.h - this.kbBottom - kh;
      ctx.fillStyle = 'rgba(20,28,24,0.55)';
      ctx.fillRect(x0 - 10, y0 - 10, kw * keys.length + 20, kh + 20);
      keys.forEach((k, i) => {
        const x = x0 + i * kw;
        const hit = this.keyHits[k];
        const age = hit ? (now - hit.t) / 600 : 1;
        ctx.fillStyle = age < 1 ? hit.c : '#FAFAF5';
        ctx.fillRect(x + 1, y0 + (age < 1 ? 4 * (1 - age) : 0), kw - 2, kh);
        ctx.strokeStyle = '#3B4A5A';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y0, kw - 2, kh);
        if (solfa[k]) {
          ctx.fillStyle = age < 1 ? '#FFFFFF' : '#5B6B62';
          ctx.font = '700 ' + Math.round(kw * 0.32) + 'px ' + FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(solfa[k], x + kw / 2, y0 + kh - kw * 0.4);
        }
      });
      // 黑鍵（裝飾用）
      ctx.fillStyle = '#2A3440';
      keys.forEach((k, i) => {
        if (i === keys.length - 1 || k[0] === 'B' || k[0] === 'E') return;
        ctx.fillRect(x0 + (i + 1) * kw - kw * 0.28, y0, kw * 0.56, kh * 0.58);
      });
    }

    drawBursts(now) {
      const ctx = this.ctx;
      this.bursts = this.bursts.filter(b => {
        const u = (now - b.t) / 450;
        if (u >= 1) return false;
        ctx.globalAlpha = 1 - u;
        ctx.strokeStyle = b.c;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(b.x, b.y, 14 + u * 50, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });
    }
  }

  function pill(ctx, x, y, text, bg, fg, size) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    const pw = ctx.measureText(text).width + size * 1.1, ph = size * 1.65;
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2); else ctx.rect(x - pw / 2, y - ph / 2, pw, ph);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  RCDD.PianoScene = PianoScene;
  RCDD.pianoPill = pill;
  RCDD.HAND_LINKS = LINKS;
  RCDD.FINGER_COLOR = COLOR;
})(window);
