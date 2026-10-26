// 摘果子遊戲畫面：鏡頭影像、蘋果樹、目標蘋果、骨架線、角度
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const DEG = Math.PI / 180;
  const COLOR = {
    skel: '#7CF0B0', skelEdge: '#10331F', apple: '#E0412F', appleDark: '#B8321F',
    leaf: '#4C9C62', trunk: '#6B4A32', canopy: ['#3E8A55', '#4C9C62', '#45935B'],
    sun: '#F2B33D', ring: '#FFE08A', ink: '#1F2A24'
  };
  // 樹上 10 顆裝飾蘋果的位置（以樹冠半徑為單位）
  const SLOTS = [
    [-0.5, -0.3], [0.1, -0.6], [0.5, -0.2], [-0.2, 0.1], [0.35, 0.3],
    [-0.6, 0.25], [0.0, -0.15], [0.62, -0.55], [-0.35, -0.68], [0.2, 0.55]
  ];
  const SEGMENTS = [['ear', 'shoulder'], ['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle']];

  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const norm = v => { const n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; };
  const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  class AppleScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.flying = [];
      this.sparks = [];
      this.floats = [];
      this.targetPos = null;
      this.wristPos = null;
      this.resize();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(root.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
    }

    clearEffects() { this.flying = []; this.sparks = []; this.floats = []; }

    // 往上飄的文字，例如「+95 分」
    floatText(text, pos) {
      const p = pos || this.targetPos || { x: this.w / 2, y: this.h / 3 };
      this.floats.push({ text, x: p.x, y: p.y, start: performance.now() });
    }

    // 影像以「填滿」方式縮放到畫布；zoom < 1 時再縮小一點（遊戲說明用，讓站著的全身都看得到）
    layout(sw, sh) {
      this.s = Math.max(this.w / sw, this.h / sh) * (this.zoom || 1);
      this.ox = (this.w - sw * this.s) / 2;
      this.oy = (this.h - sh * this.s) / 2;
    }
    map(p) { return { x: this.ox + p.x * this.s, y: this.oy + p.y * this.s, visibility: vis(p) }; }

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
      const facing = f ? f.facing : 1;
      if (fr.mode === 'calibrate' || fr.mode === 'game' || fr.mode === 'interlude') {
        this.drawTree(facing, fr.picked || 0);
      }

      let P = null;
      if (f) {
        P = {};
        for (const k in f.points) P[k] = this.map(f.points[k]);
        if (src.isDemo) this.drawFigure(P, f);
      }

      if (f && f.visible) {
        this.wristPos = P.wrist;
        if (fr.mode === 'check') this.drawBrackets(P, '#7CF0B0');
        if (fr.mode === 'game' || fr.mode === 'calibrate') this.drawTarget(P, f, fr);
        this.drawSkeleton(P);
        if (fr.mode !== 'check' || f.shoulderAngle > 25) this.drawAngle(P, f);
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      this.drawEffects(fr.now);
    }

    drawVideo(video, sw, sh) {
      const ctx = this.ctx;
      if (!video || video.readyState < 2) {
        ctx.fillStyle = '#222C31';
        ctx.fillRect(0, 0, this.w, this.h);
        return;
      }
      ctx.save();
      ctx.translate(this.ox + sw * this.s, this.oy);
      ctx.scale(-this.s, this.s);
      ctx.drawImage(video, 0, 0, sw, sh);
      ctx.restore();
    }

    drawRoom() {
      const ctx = this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3A4B52');
      g.addColorStop(1, '#222C31');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const win = this.map({ x: 120, y: 90 }), win2 = this.map({ x: 400, y: 290 });
      ctx.fillStyle = 'rgba(120,150,160,0.35)';
      ctx.fillRect(win.x, win.y, win2.x - win.x, win2.y - win.y);
      ctx.strokeStyle = '#3A4B52';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo((win.x + win2.x) / 2, win.y); ctx.lineTo((win.x + win2.x) / 2, win2.y);
      ctx.moveTo(win.x, (win.y + win2.y) / 2); ctx.lineTo(win2.x, (win.y + win2.y) / 2);
      ctx.stroke();
      const floor = this.map({ x: 0, y: 615 });
      ctx.fillStyle = '#1D262A';
      ctx.fillRect(0, floor.y, w, h - floor.y);
    }

    // 示範模式畫出虛擬長輩
    drawFigure(P, f) {
      const ctx = this.ctx;
      const tl = f.trunkLen * this.s;
      const line = (pts, width, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      // 椅子
      ctx.fillStyle = '#6B4F3A';
      const seatY = P.hip.y + tl * 0.12;
      ctx.fillRect(P.hip.x - tl * 0.5, seatY, tl * 0.95, tl * 0.12);
      ctx.fillRect(P.hip.x - tl * 0.6, P.hip.y - tl * 1.1, tl * 0.11, tl * 1.34);
      line([{ x: P.hip.x - tl * 0.4, y: seatY }, { x: P.hip.x - tl * 0.4, y: P.ankle.y + tl * 0.08 }], tl * 0.06, '#6B4F3A');
      line([{ x: P.hip.x + tl * 0.35, y: seatY }, { x: P.hip.x + tl * 0.35, y: P.ankle.y + tl * 0.08 }], tl * 0.06, '#6B4F3A');
      // 遠側手臂放在大腿上
      line([P.shoulder, { x: P.shoulder.x + tl * 0.12, y: P.shoulder.y + tl * 0.58 }, { x: P.shoulder.x + tl * 0.48, y: P.shoulder.y + tl * 0.78 }], tl * 0.16, '#587796');
      line([P.shoulder, P.hip], tl * 0.36, '#6C8FB3');
      line([P.hip, P.knee], tl * 0.28, '#44566B');
      line([P.knee, P.ankle], tl * 0.24, '#44566B');
      line([P.ankle, { x: P.ankle.x + tl * 0.3, y: P.ankle.y + tl * 0.03 }], tl * 0.13, '#2A2F33');
      const head = { x: P.ear.x * 0.65 + P.nose.x * 0.35, y: P.ear.y * 0.65 + P.nose.y * 0.35 + tl * 0.02 };
      line([{ x: head.x - tl * 0.05, y: head.y + tl * 0.2 }, { x: P.shoulder.x + tl * 0.02, y: P.shoulder.y }], tl * 0.14, '#F1C9A5');
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(head.x, head.y, tl * 0.23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CFCFCF';
      ctx.beginPath(); ctx.arc(head.x - tl * 0.02, head.y - tl * 0.02, tl * 0.23, Math.PI * 0.95, Math.PI * 1.85); ctx.fill();
      line([P.shoulder, P.elbow, P.wrist], tl * 0.18, '#6C8FB3');
      const hand = add(P.wrist, norm({ x: P.wrist.x - P.elbow.x, y: P.wrist.y - P.elbow.y }), tl * 0.08);
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(hand.x, hand.y, tl * 0.1, 0, Math.PI * 2); ctx.fill();
    }

    drawTree(facing, picked) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const R = Math.min(h * 0.2, w * 0.14);
      const bx = facing > 0 ? w - R * 1.25 : R * 1.25;
      const cy = h * 0.36;
      ctx.save();
      ctx.globalAlpha = 0.93;
      ctx.fillStyle = COLOR.trunk;
      ctx.beginPath();
      ctx.moveTo(bx - R * 0.2, h);
      ctx.lineTo(bx + R * 0.2, h);
      ctx.lineTo(bx + R * 0.1, cy + R * 0.4);
      ctx.lineTo(bx - R * 0.1, cy + R * 0.4);
      ctx.closePath();
      ctx.fill();
      const inward = -facing;
      const blobs = [
        [0, 0, 1, 0], [inward * 0.75, 0.15, 0.7, 1], [-inward * 0.55, -0.2, 0.72, 1], [0.05, -0.62, 0.7, 2]
      ];
      for (const [dx, dy, rr, c] of blobs) {
        ctx.fillStyle = COLOR.canopy[c];
        ctx.beginPath(); ctx.arc(bx + dx * R, cy + dy * R, rr * R, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = picked; i < SLOTS.length; i++) {
        const [dx, dy] = SLOTS[i];
        drawApple(ctx, bx + dx * R * facing, cy + dy * R, R * 0.12, false);
      }
      ctx.restore();
    }

    drawBrackets(P, color) {
      const ctx = this.ctx;
      let x0, y0, x1, y1;
      if (P) {
        const pts = Object.values(P).filter(p => vis(p) > 0.5);
        x0 = Math.min(...pts.map(p => p.x)); x1 = Math.max(...pts.map(p => p.x));
        y0 = Math.min(...pts.map(p => p.y)); y1 = Math.max(...pts.map(p => p.y));
        const pad = Math.max(40, (y1 - y0) * 0.18);
        x0 -= pad; x1 += pad; y0 -= pad; y1 += pad * 0.6;
      } else {
        x0 = this.w * 0.3; x1 = this.w * 0.7; y0 = this.h * 0.12; y1 = this.h * 0.92;
      }
      const L = Math.min(60, (x1 - x0) * 0.2);
      ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x0, y1 - L); ctx.lineTo(x0, y1); ctx.lineTo(x0 + L, y1);
      ctx.moveTo(x1 - L, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - L);
      ctx.stroke();
    }

    drawTarget(P, f, fr) {
      const ctx = this.ctx;
      const armLen = f.armLen * this.s;
      const down = norm({ x: P.hip.x - P.shoulder.x, y: P.hip.y - P.shoulder.y });
      const dir = rot(down, -f.facing * fr.target * DEG);
      const end = add(P.shoulder, dir, armLen * 1.4);

      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(P.shoulder.x, P.shoulder.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.restore();

      const label = fr.mode === 'calibrate' ? '盡量舉高' : '目標 ' + Math.round(fr.target) + '°';
      const lp = add(end, dir, 34);
      pill(ctx, clamp(lp.x, 90, this.w - 90), clamp(lp.y, 30, this.h - 30), label, 'rgba(0,0,0,0.35)', '#FFFFFF', 24, false);

      if (fr.mode !== 'game') return;
      const r = clamp(armLen * 0.11, 18, 46);
      // 人坐得太靠近畫面上緣時，把蘋果沿目標方向往內移，避免跑出畫面
      let reach = armLen * 1.08;
      const minY = r * 2.2 + 8;
      if (dir.y < 0 && P.shoulder.y + dir.y * reach < minY) {
        reach = Math.max(armLen * 0.7, (P.shoulder.y - minY) / -dir.y);
      }
      const a = add(P.shoulder, dir, reach);
      this.targetPos = a;
      this.appleR = r;
      if (fr.repPicked) return;

      const ring = r * 1.8;
      ctx.lineWidth = Math.max(6, r * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(a.x, a.y, ring, 0, Math.PI * 2); ctx.stroke();
      if (fr.holdProgress > 0) {
        ctx.strokeStyle = COLOR.ring;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(a.x, a.y, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fr.holdProgress);
        ctx.stroke();
      }
      const pulse = fr.reached ? 1 + 0.08 * Math.sin(fr.now / 120) : 1;
      drawApple(ctx, a.x, a.y, r * pulse, fr.reached);
    }

    drawSkeleton(P) {
      const ctx = this.ctx;
      ctx.strokeStyle = COLOR.skel; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of SEGMENTS) {
        if (vis(P[a]) > 0.5 && vis(P[b]) > 0.5) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); }
      }
      ctx.stroke();
      for (const k of ['ear', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) {
        const p = P[k];
        if (vis(p) <= 0.5) continue;
        ctx.fillStyle = COLOR.skel; ctx.strokeStyle = COLOR.skelEdge; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, k === 'shoulder' ? 11 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    drawAngle(P, f) {
      const ctx = this.ctx;
      const armLen = f.armLen * this.s;
      const down = norm({ x: P.hip.x - P.shoulder.x, y: P.hip.y - P.shoulder.y });
      const arm = norm({ x: P.elbow.x - P.shoulder.x, y: P.elbow.y - P.shoulder.y });
      const r = clamp(armLen * 0.26, 30, 90);
      const a0 = Math.atan2(down.y, down.x), a1 = Math.atan2(arm.y, arm.x);
      ctx.fillStyle = 'rgba(242,179,61,0.35)';
      ctx.strokeStyle = COLOR.sun;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(P.shoulder.x, P.shoulder.y);
      ctx.arc(P.shoulder.x, P.shoulder.y, r, a0, a1, f.facing > 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      const bis = rot(down, -f.facing * (f.shoulderAngle / 2) * DEG);
      const lp = add(P.shoulder, bis, r + 50);
      pill(ctx, lp.x, lp.y, Math.round(f.shoulderAngle) + '°', COLOR.sun, COLOR.ink, 30, true);
    }

    // 摘到的蘋果飛進籃子
    launchApple(to, small, onDone) {
      const from = small ? (this.wristPos || { x: this.w / 2, y: this.h / 2 }) : (this.targetPos || { x: this.w / 2, y: this.h / 3 });
      const r = small ? (this.appleR || 26) * 0.65 : (this.appleR || 26);
      this.flying.push({ from: { x: from.x, y: from.y }, to, r, start: performance.now(), dur: 900, onDone });
      if (!small) {
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
          this.sparks.push({ x: from.x, y: from.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, c: i % 2 ? COLOR.ring : '#FFFFFF' });
        }
      }
    }

    drawEffects(now) {
      const ctx = this.ctx;
      this.flying = this.flying.filter(fl => {
        const u = clamp((now - fl.start) / fl.dur, 0, 1);
        const e = u * u * (3 - 2 * u);
        const cx = (fl.from.x + fl.to.x) / 2, cy = Math.min(fl.from.y, fl.to.y) - 120;
        const x = (1 - e) * (1 - e) * fl.from.x + 2 * (1 - e) * e * cx + e * e * fl.to.x;
        const y = (1 - e) * (1 - e) * fl.from.y + 2 * (1 - e) * e * cy + e * e * fl.to.y;
        drawApple(ctx, x, y, fl.r * (1 - 0.35 * e), false);
        if (u >= 1) { if (fl.onDone) fl.onDone(); return false; }
        return true;
      });
      this.sparks = this.sparks.filter(s => {
        s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.life -= 0.025;
        if (s.life <= 0) return false;
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });
      this.floats = this.floats.filter(fl => {
        const u = (now - fl.start) / 1600;
        if (u >= 1) return false;
        ctx.globalAlpha = 1 - u * u;
        pill(ctx, clamp(fl.x, 90, this.w - 90), clamp(fl.y - 30 - u * 70, 30, this.h - 30), fl.text, '#FFFFFF', '#D64533', 32, true);
        ctx.globalAlpha = 1;
        return true;
      });
    }
  }

  function drawApple(ctx, x, y, r, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = '#FFE08A'; ctx.shadowBlur = r * 1.2; }
    ctx.fillStyle = COLOR.apple;
    ctx.beginPath(); ctx.arc(x, y + r * 0.08, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.25, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLOR.trunk; ctx.lineWidth = Math.max(2, r * 0.15); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x + r * 0.12, y - r * 1.25); ctx.stroke();
    ctx.fillStyle = COLOR.leaf;
    ctx.beginPath(); ctx.ellipse(x + r * 0.45, y - r * 1.1, r * 0.38, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  function pill(ctx, x, y, text, bg, fg, size, bold) {
    ctx.font = (bold ? '700 ' : '500 ') + size + 'px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    const tw = ctx.measureText(text).width;
    const pw = tw + size * 1.1, ph = size * 1.65;
    const px = x - pw / 2, py = y - ph / 2;
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, ph / 2); else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  RCDD.AppleScene = AppleScene;
})(window);
