// 打鼓遊戲畫面：肩膀旁的兩面鼓、亮起提示、拍到的特效
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const HAND_LABEL = { L: '左手', R: '右手' };
  // 手 → 要拍的那面鼓（在對側肩膀）
  const DRUM_OF = { R: 'LS', L: 'RS' };

  class DrumScene extends RCDD.AppleScene {
    constructor(canvas) {
      super(canvas);
      this.hits = { LS: 0, RS: 0 };
      this.notes = [];
      this.drumPos = {};
    }

    clearEffects() {
      super.clearEffects();
      this.notes = [];
      this.hits = { LS: 0, RS: 0 };
    }

    // 拍到：鼓震動、飛出音符
    hit(hand, soft) {
      const key = DRUM_OF[hand];
      this.hits[key] = performance.now();
      const d = this.drumPos[key];
      if (!d) return;
      const count = soft ? 3 : 7;
      for (let i = 0; i < count; i++) {
        this.notes.push({
          x: d.x + (Math.random() - 0.5) * d.r, y: d.y - d.r * 0.4,
          vx: (Math.random() - 0.5) * 2.4, vy: -2.2 - Math.random() * 2,
          life: 1, ch: i % 2 ? '♪' : '♫', size: soft ? 26 : 34 + Math.random() * 10,
          c: ['#FFE08A', '#FFFFFF', '#F4A6B8', '#9DE0B8'][i % 4]
        });
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
      let P = null;
      if (f) {
        P = {};
        for (const k in f.points) if (f.points[k]) P[k] = this.map(f.points[k]);
        if (src.isDemo) this.drawFrontBody(P, f);
      }

      if (f && f.visible) {
        const sw = f.sw * this.s;
        const playing = fr.mode === 'game' || fr.mode === 'calibrate';
        if (fr.mode === 'check') this.drawBrackets(P, '#7CF0B0');
        this.drawMidline(P, sw);
        for (const key of ['LS', 'RS']) {
          const lit = playing && DRUM_OF[fr.cue] === key && fr.phase === 'cue';
          this.drawDrum(key, P, sw, lit, fr.now, playing ? 1 : 0.55, lit ? fr.glow : 0);
        }
        if (src.isDemo) this.drawFrontArms(P, f);
        this.drawSkeleton2(P);
        if (playing && fr.phase === 'cue') this.drawCueArrow(fr.cue, P, sw);
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      this.drawNotes();
      this.drawEffects(fr.now);
    }

    drawMidline(P, sw) {
      const ctx = this.ctx;
      const top = { x: P.N.x, y: P.N.y - sw * 0.2 };
      const midHip = P.LH && P.RH && vis(P.LH) > 0.3 ? { x: (P.LH.x + P.RH.x) / 2, y: (P.LH.y + P.RH.y) / 2 } : { x: P.N.x, y: P.N.y + sw * 1.8 };
      ctx.save();
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(midHip.x, midHip.y); ctx.stroke();
      ctx.restore();
    }

    drawDrum(key, P, sw, lit, now, alpha, glow) {
      const ctx = this.ctx;
      const sh = P[key];
      const out = key === 'LS' ? -1 : 1;
      const r = clamp(sw * 0.3, 26, 110);
      // 鼓放在肩膀稍微外側、偏上
      let x = sh.x + out * sw * 0.12, y = sh.y - sw * 0.08;
      const since = now - (this.hits[key] || -1e9);
      const shake = since < 400 ? (1 - since / 400) * r * 0.12 : 0;
      x += Math.sin(since / 22) * shake;
      this.drumPos[key] = { x, y, r };

      ctx.save();
      ctx.globalAlpha = alpha;
      if (lit) {
        const pulse = 1 + 0.08 * Math.sin(now / 160) + glow * 0.12;
        ctx.strokeStyle = '#FFE08A';
        ctx.lineWidth = 8;
        ctx.shadowColor = '#FFE08A';
        ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(x, y, r * 1.25 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // 鼓身
      ctx.fillStyle = '#B8321F';
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r, r * 0.42, 0, 0, Math.PI); ctx.fill();
      ctx.fillRect(x - r, y, r * 2, r * 0.35);
      // 鼓皮
      ctx.fillStyle = lit ? '#FFF6E0' : '#F2E3C6';
      ctx.strokeStyle = '#8A2A1A';
      ctx.lineWidth = Math.max(3, r * 0.08);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 鼓釘
      ctx.fillStyle = '#3A2A1A';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.38, Math.max(1.5, r * 0.04), 0, Math.PI * 2); ctx.fill();
      }
      // 拍到的衝擊圈
      if (since < 500) {
        const u = since / 500;
        ctx.globalAlpha = (1 - u) * alpha;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(x, y, r * (1 + u * 0.8), r * 0.42 * (1 + u * 0.8), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      if (lit) pill(ctx, x, y - r * 0.9 - 26, '拍這裡', '#FFE08A', '#4A3300', 24);
    }

    drawCueArrow(hand, P, sw) {
      const ctx = this.ctx;
      const w = hand === 'R' ? P.RW : P.LW;
      const d = this.drumPos[DRUM_OF[hand]];
      if (!w || !d || vis(w) < 0.3) return;
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = 'rgba(255,224,138,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.quadraticCurveTo((w.x + d.x) / 2, Math.min(w.y, d.y) - sw * 0.1, d.x, d.y + d.r * 0.5);
      ctx.stroke();
      ctx.restore();
      pill(ctx, w.x, w.y + 40, HAND_LABEL[hand], '#FFFFFF', '#1F2A24', 26);
    }

    drawSkeleton2(P) {
      const ctx = this.ctx;
      const segs = [['LS', 'RS'], ['LS', 'LE'], ['LE', 'LW'], ['RS', 'RE'], ['RE', 'RW']];
      ctx.strokeStyle = '#7CF0B0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of segs) {
        if (P[a] && P[b] && vis(P[a]) > 0.5 && vis(P[b]) > 0.5) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); }
      }
      ctx.stroke();
      for (const k of ['N', 'LS', 'RS', 'LE', 'RE', 'LW', 'RW']) {
        const p = P[k];
        if (!p || vis(p) <= 0.5) continue;
        ctx.fillStyle = '#7CF0B0'; ctx.strokeStyle = '#10331F'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, k === 'LW' || k === 'RW' ? 11 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    // 示範模式：正面坐著的身體（手臂另外畫在鼓的前面）
    drawFrontBody(P, f) {
      const ctx = this.ctx;
      const sw = f.sw * this.s;
      const line = (pts, width, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      // 椅背
      ctx.fillStyle = '#6B4F3A';
      ctx.fillRect(P.LS.x - sw * 0.25, P.LS.y - sw * 0.35, sw * 1.5, sw * 1.6);
      // 腿
      const hipY = (P.LH.y + P.RH.y) / 2;
      line([P.LH, { x: P.LH.x - sw * 0.05, y: hipY + sw * 0.55 }], sw * 0.3, '#44566B');
      line([P.RH, { x: P.RH.x + sw * 0.05, y: hipY + sw * 0.55 }], sw * 0.3, '#44566B');
      // 身體
      ctx.fillStyle = '#6C8FB3';
      ctx.beginPath();
      ctx.moveTo(P.LS.x - sw * 0.08, P.LS.y);
      ctx.lineTo(P.RS.x + sw * 0.08, P.RS.y);
      ctx.lineTo(P.RH.x + sw * 0.08, P.RH.y);
      ctx.lineTo(P.LH.x - sw * 0.08, P.LH.y);
      ctx.closePath();
      ctx.fill();
      line([P.LS, P.RS], sw * 0.2, '#6C8FB3');
      // 頭
      const mid = { x: (P.LS.x + P.RS.x) / 2, y: (P.LS.y + P.RS.y) / 2 };
      line([mid, { x: P.N.x, y: P.N.y + sw * 0.15 }], sw * 0.16, '#F1C9A5');
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(P.N.x, P.N.y + sw * 0.02, sw * 0.31, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CFCFCF';
      ctx.beginPath(); ctx.arc(P.N.x, P.N.y - sw * 0.04, sw * 0.31, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    }

    drawFrontArms(P, f) {
      const sw = f.sw * this.s;
      const ctx = this.ctx;
      for (const [s, e, w] of [['LS', 'LE', 'LW'], ['RS', 'RE', 'RW']]) {
        ctx.strokeStyle = '#6C8FB3'; ctx.lineWidth = sw * 0.15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(P[s].x, P[s].y); ctx.lineTo(P[e].x, P[e].y); ctx.lineTo(P[w].x, P[w].y); ctx.stroke();
        ctx.fillStyle = '#F1C9A5';
        ctx.beginPath(); ctx.arc(P[w].x, P[w].y, sw * 0.08, 0, Math.PI * 2); ctx.fill();
      }
    }

    drawNotes() {
      const ctx = this.ctx;
      this.notes = this.notes.filter(n => {
        n.x += n.vx; n.y += n.vy; n.vy += 0.03; n.life -= 0.016;
        if (n.life <= 0) return false;
        ctx.globalAlpha = n.life;
        ctx.fillStyle = n.c;
        ctx.font = '700 ' + n.size + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.ch, n.x, n.y);
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

  RCDD.DrumScene = DrumScene;
})(window);
