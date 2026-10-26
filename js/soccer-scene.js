// 踢足球畫面（正面站姿）：腳要踢到的球、右上角的球門與守門員、射門動畫
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const LEG_NAME = { L: '左腳', R: '右腳' };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const easeOut = u => 1 - Math.pow(1 - u, 3);

  class SoccerScene extends RCDD.BikeScene {
    constructor(canvas) {
      super(canvas);
      this.goals = 0;
      this.shots = [];
      this.banner = null;
      this.keeper = { x: 0, to: 0, dive: 0 };
      this.netAt = 0;
      this.footPos = null;
    }

    clearEffects() {
      super.clearEffects();
      this.goals = 0;
      this.shots = [];
      this.banner = null;
      this.keeper = { x: 0, to: 0, dive: 0 };
      this.netAt = 0;
    }

    // 射門：goal = 進球（踢到目標），否則被守門員接住
    shoot(goal) {
      const from = this.footPos || { x: this.w / 2, y: this.h * 0.7, r: 30 };
      const side = Math.random() < 0.5 ? -1 : 1;
      this.shots.push({ goal, side, from: { x: from.x, y: from.y }, r: from.r || 30, t: performance.now(), done: false });
      this.keeper.to = goal ? -side : side * 0.3;
    }

    showBanner(text, color) {
      this.banner = { text, color: color || '#E0412F', t: performance.now() };
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
      this.footPos = null;
      if (f) {
        const L = {};
        for (const s of ['L', 'R']) {
          const g = f.legs[s];
          L[s] = { hip: this.map(g.hip), knee: this.map(g.knee), ankle: this.map(g.ankle), vis: g.vis };
        }
        const sh = { L: this.map(f.points.LS), R: this.map(f.points.RS), N: this.map(f.points.N) };
        const sw = f.sw * this.s;
        if (src.isDemo) this.drawKickStanding(L, sh, sw, fr.base);
        if (f.visible) {
          if (fr.mode === 'check') {
            const pts = { sl: sh.L, sr: sh.R, n: sh.N };
            for (const s of ['L', 'R']) for (const k of ['hip', 'knee', 'ankle']) pts[s + k] = L[s][k];
            this.drawBrackets(pts, '#7CF0B0');
          }
          const playing = fr.mode === 'game' || fr.mode === 'calibrate';
          this.drawLegs(L, playing ? fr.cue : null);
          if (playing && fr.base) this.drawBallTarget(L[fr.cue], fr.cue, sw, fr);
        }
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      if (fr.mode !== 'check' && fr.mode !== 'loading') this.drawField(fr);
      this.drawShots(fr.now);
      this.drawConfetti();
      this.drawEffects(fr.now);
    }

    // 示範模式：正面站著扶椅背的虛擬長輩；往前踢的那隻腳，鞋底朝向鏡頭
    drawKickStanding(L, sh, sw, base) {
      this.drawFrontStanding(L, sh, sw);
      if (!base) return;
      const ctx = this.ctx;
      for (const s of ['L', 'R']) {
        const g = L[s];
        if (base[s] == null) continue;
        const k = clamp(((g.hip.y - g.ankle.y) / sw - base[s]) / 0.8, 0, 1);
        if (k < 0.15) continue;
        ctx.fillStyle = '#2A2F33';
        ctx.beginPath();
        ctx.ellipse(g.ankle.x, g.ankle.y + sw * 0.04, sw * (0.13 + 0.03 * k), sw * (0.08 + 0.12 * k), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 腳要踢到的高度：虛線上放一顆球，旁邊有高度條
    drawBallTarget(g, leg, sw, fr) {
      if (!g || g.vis < 0.2 || fr.base[leg] == null) return;
      const ctx = this.ctx;
      const restY = g.hip.y - fr.base[leg] * sw;
      const targetY = g.hip.y - (fr.base[leg] + fr.target) * sw;
      const x = g.ankle.x, half = sw * 0.32;
      const out = leg === 'L' ? -1 : 1;
      const calib = fr.mode === 'calibrate';
      const r = clamp(sw * 0.17, 14, 40);

      ctx.save();
      ctx.setLineDash([12, 9]);
      ctx.strokeStyle = fr.reached ? '#FFE08A' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - half, targetY); ctx.lineTo(x + half, targetY); ctx.stroke();
      ctx.restore();

      // 高度條：從平常站著的腳踝高度到目標
      const bx = x + out * sw * 0.5, bw = 16;
      const h = Math.max(restY - targetY, 1);
      const p = clamp((restY - g.ankle.y) / h, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx - bw / 2, targetY, bw, h);
      ctx.fillStyle = fr.reached ? '#FFE08A' : '#7CF0B0';
      ctx.fillRect(bx - bw / 2, restY - h * p, bw, h * p);
      ctx.strokeStyle = '#FFE08A';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx - bw, targetY); ctx.lineTo(bx + bw, targetY); ctx.stroke();

      // 「踢右腳」放在高度條外側，不會被下方按鈕列擋住
      const legPill = () => pill(ctx, bx + out * 62, targetY - r, '踢' + LEG_NAME[leg], '#FFFFFF', '#1F2A24', 22);
      if (calib) {
        pill(ctx, x, targetY - 30, '盡量往前踢高', 'rgba(0,0,0,0.5)', '#FFFFFF', 20);
        legPill();
        return;
      }
      // 球：踢到就飛出去，下一下再出現
      this.footPos = { x, y: targetY - r, r };
      if (!fr.reached) {
        drawBall(ctx, x, targetY - r, r, 0);
        pill(ctx, x, targetY - r * 2 - 20, '踢到球', 'rgba(0,0,0,0.5)', '#FFFFFF', 20);
      }
      legPill();
    }

    // ---------- 右上角的球門 ----------
    fieldRect() {
      const wide = this.w >= 980;
      const box = this.fieldBox;
      const x0 = box ? box.side : wide ? Math.round(this.w * 0.6) : 16;
      const x1 = box ? this.w - box.side : wide ? this.w - 170 : this.w - 16;
      const y0 = box ? box.top : wide ? 12 : 200;
      const h = box ? box.h : wide ? 140 : 120;
      const w = x1 - x0;
      const gx0 = x0 + w * 0.28, gx1 = x0 + w * 0.72, gy0 = y0 + h * 0.16, gy1 = y0 + h * 0.66;
      return { x0, x1, y0, h, w, gx0, gx1, gy0, gy1 };
    }

    // 射門的目標點：進球打角落，沒進就打到守門員手上
    shotTarget(s, R) {
      const gw = R.gx1 - R.gx0, gh = R.gy1 - R.gy0;
      if (s.goal) return { x: s.side < 0 ? R.gx0 + gw * 0.14 : R.gx1 - gw * 0.14, y: R.gy0 + gh * 0.32 };
      return { x: (R.gx0 + R.gx1) / 2 + this.keeper.to * gw * 0.32, y: R.gy0 + gh * 0.45 };
    }

    drawField(fr) {
      const ctx = this.ctx;
      const R = this.fieldRect();
      if (R.w < 200) return;
      const now = performance.now();
      const { x0, x1, y0, h, w, gx0, gx1, gy0, gy1 } = R;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 18); else ctx.rect(x0, y0, w, h);
      ctx.clip();
      // 觀眾席與草地
      ctx.fillStyle = '#3B4A63';
      ctx.fillRect(x0, y0, w, h * 0.3);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = ['#E0412F', '#F2B33D', '#FFFFFF', '#4F9BD9'][i % 4];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x0 + (i * 37 % w), y0 + 4 + (i * 13 % 26) + Math.sin(now / 300 + i) * (this.netAt && now - this.netAt < 2000 ? 3 : 0.6), 4, 4);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#4C9C62' : '#55A86B';
        ctx.fillRect(x0 + (w / 8) * i, y0 + h * 0.3, w / 8 + 1, h);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, gy1); ctx.lineTo(x1, gy1); ctx.stroke();
      ctx.strokeRect(gx0 - w * 0.08, gy1, (gx1 - gx0) + w * 0.16, h * 0.18);

      // 球門與球網（進球時球網鼓起來）
      const bulge = this.netAt ? Math.max(0, 1 - (now - this.netAt) / 700) : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      for (let x = gx0; x <= gx1; x += 8) { ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x + bulge * 4, gy1); ctx.stroke(); }
      for (let y = gy0; y <= gy1; y += 8) { ctx.beginPath(); ctx.moveTo(gx0, y - bulge * 3); ctx.lineTo(gx1, y - bulge * 3); ctx.stroke(); }
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx0, gy1); ctx.lineTo(gx0, gy0); ctx.lineTo(gx1, gy0); ctx.lineTo(gx1, gy1); ctx.stroke();

      // 守門員：平常左右小步移動，射門時撲向一邊
      const k = this.keeper;
      k.x += (k.to - k.x) * 0.12;
      if (!this.shots.length) k.to *= 0.97;
      const idle = this.shots.length ? 0 : Math.sin(now / 500) * 0.12;
      drawKeeper(ctx, (gx0 + gx1) / 2 + (k.x + idle) * (gx1 - gx0) * 0.32, gy1, (gy1 - gy0) * 0.8, k.x);

      // 進球數
      const label = fr.total ? '進球 ' + this.goals + ' 球　還有 ' + Math.max(fr.total - fr.reps, 0) + ' 下' : '進球 ' + this.goals + ' 球';
      ctx.font = '700 18px ' + FONT;
      const tw = ctx.measureText(label).width + 24;
      ctx.fillStyle = 'rgba(31,42,36,0.75)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0 + 10, y0 + h - 34, tw, 26, 13); else ctx.rect(x0 + 10, y0 + h - 34, tw, 26);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x0 + 22, y0 + h - 21);
      ctx.restore();

      if (this.banner) {
        const u = (now - this.banner.t) / 2400;
        if (u >= 1) this.banner = null;
        else {
          ctx.globalAlpha = u < 0.85 ? 1 : (1 - u) / 0.15;
          const sc = 1 + 0.06 * Math.sin(u * 20);
          pill(ctx, (x0 + x1) / 2, y0 + h + 34, this.banner.text, this.banner.color, '#FFFFFF', Math.round(28 * sc));
          ctx.globalAlpha = 1;
        }
      }
    }

    // 球從腳邊飛向球門
    drawShots(now) {
      const ctx = this.ctx;
      const R = this.fieldRect();
      this.shots = this.shots.filter(s => {
        const u = clamp((now - s.t) / 900, 0, 1);
        const e = easeOut(u);
        const to = this.shotTarget(s, R);
        const cx = (s.from.x + to.x) / 2, cy = Math.min(s.from.y, to.y) - 120;
        const x = (1 - e) * (1 - e) * s.from.x + 2 * (1 - e) * e * cx + e * e * to.x;
        const y = (1 - e) * (1 - e) * s.from.y + 2 * (1 - e) * e * cy + e * e * to.y;
        drawBall(ctx, x, y, s.r + (7 - s.r) * e, u * 12);
        if (u >= 1 && !s.done) {
          s.done = true;
          if (s.goal) {
            this.goals++;
            this.netAt = now;
            this.showBanner('進球了！', '#E0412F');
            for (let i = 0; i < 30; i++) {
              this.confetti.push({ x: to.x, y: to.y, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 5 - 1, life: 1,
                c: ['#F2B33D', '#E0412F', '#4C9C62', '#4F9BD9', '#FFFFFF'][i % 5] });
            }
          } else {
            this.showBanner('被守門員接住了！', '#6C8FB3');
          }
        }
        return u < 1 || now - s.t < 1100;
      });
    }
  }

  // 足球：白底黑色五角形；spin 讓花紋轉動
  function drawBall(ctx, x, y, r, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin || 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#2A2F33';
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2A2F33';
    const pent = (cx, cy, s) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      }
      ctx.closePath();
      ctx.fill();
    };
    pent(0, 0, r * 0.32);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      pent(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.2);
    }
    ctx.restore();
  }

  // 守門員：黃色球衣；lean 越大越往旁邊撲
  function drawKeeper(ctx, x, footY, size, lean) {
    ctx.save();
    ctx.translate(x, footY);
    ctx.rotate(clamp(lean, -1, 1) * 0.9);
    ctx.strokeStyle = '#2A3440';
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.1, 0); ctx.lineTo(-size * 0.06, -size * 0.4); ctx.moveTo(size * 0.1, 0); ctx.lineTo(size * 0.06, -size * 0.4); ctx.stroke();
    ctx.fillStyle = '#F2B33D';
    ctx.fillRect(-size * 0.16, -size * 0.78, size * 0.32, size * 0.4);
    ctx.strokeStyle = '#F2B33D';
    ctx.lineWidth = size * 0.09;
    ctx.beginPath(); ctx.moveTo(-size * 0.14, -size * 0.72); ctx.lineTo(-size * 0.34, -size * 0.98); ctx.moveTo(size * 0.14, -size * 0.72); ctx.lineTo(size * 0.34, -size * 0.98); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-size * 0.36, -size * 1.0, size * 0.07, 0, Math.PI * 2); ctx.arc(size * 0.36, -size * 1.0, size * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F1C9A5';
    ctx.beginPath(); ctx.arc(0, -size * 0.9, size * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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

  RCDD.SoccerScene = SoccerScene;
  RCDD.drawBall = drawBall;
})(window);
