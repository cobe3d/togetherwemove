// 騎腳踏車畫面（正面站姿）：膝蓋要抬到的高度、上方的環島旅程（腳踏車、風景、景點）
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const DEG = Math.PI / 180;
  const FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const LEG_NAME = { L: '左腳', R: '右腳' };
  const vis = p => (p && p.visibility != null ? p.visibility : 1);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const norm = v => { const n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; };
  const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

  class BikeScene extends RCDD.AppleScene {
    constructor(canvas) {
      super(canvas);
      this.dist = 0;
      this.arrival = null;
      this.confetti = [];
    }

    clearEffects() {
      super.clearEffects();
      this.dist = 0;
      this.arrival = null;
      this.confetti = [];
    }

    // 抵達景點：橫幅與彩帶
    arrive(name, x, y) {
      this.arrival = { name, t: performance.now() };
      for (let i = 0; i < 30; i++) {
        this.confetti.push({ x: x || this.w / 2, y: y || 60, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 5 - 1, life: 1,
          c: ['#F2B33D', '#E0412F', '#4C9C62', '#4F9BD9', '#F4A6B8'][i % 5] });
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
        const L = {};
        for (const s of ['L', 'R']) {
          const g = f.legs[s];
          L[s] = { hip: this.map(g.hip), knee: this.map(g.knee), ankle: this.map(g.ankle), vis: g.vis };
        }
        const sh = { L: this.map(f.points.LS), R: this.map(f.points.RS), N: this.map(f.points.N) };
        const sw = f.sw * this.s;
        if (src.isDemo) this.drawFrontStanding(L, sh, sw);
        if (f.visible) {
          if (fr.mode === 'check') {
            const pts = { sl: sh.L, sr: sh.R, n: sh.N };
            for (const s of ['L', 'R']) for (const k of ['hip', 'knee']) pts[s + k] = L[s][k];
            this.drawBrackets(pts, '#7CF0B0');
          }
          const playing = fr.mode === 'game' || fr.mode === 'calibrate';
          this.drawLegs(L, playing ? fr.cue : null);
          if (playing) this.drawKneeTarget(L[fr.cue], fr.cue, sw, fr);
        }
      } else if (fr.mode === 'check') {
        this.drawBrackets(null, 'rgba(255,255,255,0.7)');
      }

      if (fr.mode !== 'check' && fr.mode !== 'loading') this.drawTrip(fr);
      this.drawConfetti();
      this.drawEffects(fr.now);
    }

    // 示範模式：正面站著、左手扶著旁邊椅背的虛擬長輩
    drawFrontStanding(L, sh, sw) {
      const ctx = this.ctx;
      const line = (pts, width, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      const hip = L.L.hip, hipR = L.R.hip;
      const floor = hip.y + sw * 2.3;
      // 椅子（在身體左邊，椅背朝向長輩）
      const cx0 = hip.x - sw * 1.3, cx1 = hip.x - sw * 0.72;
      const top = hip.y - sw * 0.12, seat = hip.y + sw * 0.75;
      ctx.fillStyle = '#6B4F3A';
      ctx.fillRect(cx0, top, cx1 - cx0, sw * 0.12);
      ctx.fillRect(cx0, top, sw * 0.08, floor - top);
      ctx.fillRect(cx1 - sw * 0.08, top, sw * 0.08, floor - top);
      ctx.fillStyle = '#8A6A4F';
      ctx.fillRect(cx0 - sw * 0.1, seat, cx1 - cx0 + sw * 0.2, sw * 0.1);
      // 腿：大腿、小腿、鞋子
      for (const s of ['L', 'R']) {
        const g = L[s];
        line([g.hip, g.knee], sw * 0.3, '#44566B');
        line([g.knee, g.ankle], sw * 0.24, '#44566B');
        ctx.fillStyle = '#2A2F33';
        ctx.beginPath(); ctx.ellipse(g.ankle.x, g.ankle.y + sw * 0.06, sw * 0.17, sw * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 身體
      ctx.fillStyle = '#6C8FB3';
      ctx.beginPath();
      ctx.moveTo(sh.L.x - sw * 0.08, sh.L.y);
      ctx.lineTo(sh.R.x + sw * 0.08, sh.R.y);
      ctx.lineTo(hipR.x + sw * 0.12, hipR.y + sw * 0.05);
      ctx.lineTo(hip.x - sw * 0.12, hip.y + sw * 0.05);
      ctx.closePath();
      ctx.fill();
      line([sh.L, sh.R], sw * 0.2, '#6C8FB3');
      // 左手扶椅背、右手自然垂下
      line([sh.L, { x: sh.L.x - sw * 0.33, y: sh.L.y + sw * 0.57 }, { x: cx1 - sw * 0.12, y: top + sw * 0.02 }], sw * 0.14, '#587796');
      line([sh.R, { x: sh.R.x + sw * 0.18, y: sh.R.y + sw * 0.57 }, { x: sh.R.x + sw * 0.13, y: hipR.y + sw * 0.05 }], sw * 0.14, '#587796');
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(cx1 - sw * 0.12, top + sw * 0.04, sw * 0.08, 0, Math.PI * 2); ctx.fill();
      // 頭
      const mid = { x: (sh.L.x + sh.R.x) / 2, y: (sh.L.y + sh.R.y) / 2 };
      line([mid, { x: sh.N.x, y: sh.N.y + sw * 0.15 }], sw * 0.16, '#F1C9A5');
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(sh.N.x, sh.N.y + sw * 0.02, sw * 0.31, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CFCFCF';
      ctx.beginPath(); ctx.arc(sh.N.x, sh.N.y - sw * 0.04, sw * 0.31, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    }

    // 示範模式：正面坐著的虛擬長輩
    drawFrontSeated(L, sh, sw) {
      const ctx = this.ctx;
      const line = (pts, width, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      // 椅背
      ctx.fillStyle = '#6B4F3A';
      ctx.fillRect(sh.L.x - sw * 0.25, sh.L.y - sw * 0.35, sw * 1.5, sw * 1.4);
      // 腿：大腿（臀部 → 膝蓋）、小腿、腳
      for (const s of ['L', 'R']) {
        const g = L[s];
        line([g.hip, g.knee], sw * 0.3, '#44566B');
        line([g.knee, g.ankle], sw * 0.24, '#44566B');
        ctx.fillStyle = '#2A2F33';
        ctx.beginPath(); ctx.ellipse(g.ankle.x, g.ankle.y + sw * 0.06, sw * 0.16, sw * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 身體
      ctx.fillStyle = '#6C8FB3';
      ctx.beginPath();
      ctx.moveTo(sh.L.x - sw * 0.08, sh.L.y);
      ctx.lineTo(sh.R.x + sw * 0.08, sh.R.y);
      ctx.lineTo(L.R.hip.x + sw * 0.1, L.R.hip.y);
      ctx.lineTo(L.L.hip.x - sw * 0.1, L.L.hip.y);
      ctx.closePath();
      ctx.fill();
      line([sh.L, sh.R], sw * 0.2, '#6C8FB3');
      // 手放在大腿旁
      line([sh.L, { x: sh.L.x - sw * 0.1, y: sh.L.y + sw * 0.6 }, { x: L.L.hip.x - sw * 0.02, y: L.L.hip.y + sw * 0.05 }], sw * 0.14, '#587796');
      line([sh.R, { x: sh.R.x + sw * 0.1, y: sh.R.y + sw * 0.6 }, { x: L.R.hip.x + sw * 0.02, y: L.R.hip.y + sw * 0.05 }], sw * 0.14, '#587796');
      // 頭
      const mid = { x: (sh.L.x + sh.R.x) / 2, y: (sh.L.y + sh.R.y) / 2 };
      line([mid, { x: sh.N.x, y: sh.N.y + sw * 0.15 }], sw * 0.16, '#F1C9A5');
      ctx.fillStyle = '#F1C9A5';
      ctx.beginPath(); ctx.arc(sh.N.x, sh.N.y + sw * 0.02, sw * 0.31, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CFCFCF';
      ctx.beginPath(); ctx.arc(sh.N.x, sh.N.y - sw * 0.04, sw * 0.31, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    }

    drawLegs(L, cue) {
      const ctx = this.ctx;
      for (const s of ['R', 'L']) {
        const g = L[s];
        if (g.vis < 0.2) continue;
        const on = cue === s;
        ctx.strokeStyle = on ? '#FFE08A' : 'rgba(124,240,176,0.8)';
        ctx.lineWidth = on ? 8 : 5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(g.hip.x, g.hip.y); ctx.lineTo(g.knee.x, g.knee.y); ctx.lineTo(g.ankle.x, g.ankle.y); ctx.stroke();
        for (const k of ['hip', 'knee', 'ankle']) {
          ctx.fillStyle = on ? '#FFE08A' : '#7CF0B0';
          ctx.strokeStyle = '#10331F';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(g[k].x, g[k].y, k === 'knee' ? 12 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }

    // 膝蓋要抬到的高度：虛線＋旁邊的高度條
    drawKneeTarget(g, leg, sw, fr) {
      if (!g || g.vis < 0.2 || fr.base == null) return;
      const ctx = this.ctx;
      const restY = g.hip.y - fr.base * sw;
      const targetY = g.hip.y - (fr.base + fr.target) * sw;
      const x = g.knee.x, half = sw * 0.32;
      const out = leg === 'L' ? -1 : 1;

      ctx.save();
      ctx.setLineDash([12, 9]);
      ctx.strokeStyle = fr.reached ? '#FFE08A' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - half, targetY); ctx.lineTo(x + half, targetY); ctx.stroke();
      ctx.restore();
      pill(ctx, x, targetY - 26, fr.mode === 'calibrate' ? '盡量抬高' : '膝蓋抬到這裡', 'rgba(0,0,0,0.5)', '#FFFFFF', 22);

      // 高度條：從平常坐著的高度到目標
      const bx = x + out * sw * 0.5, bw = 18;
      const top = targetY, bottom = restY, h = Math.max(bottom - top, 1);
      const p = clamp((restY - g.knee.y) / h, 0, 1.15);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx - bw / 2, top, bw, h);
      ctx.fillStyle = fr.reached ? '#FFE08A' : '#7CF0B0';
      ctx.fillRect(bx - bw / 2, bottom - h * Math.min(p, 1), bw, h * Math.min(p, 1));
      ctx.strokeStyle = '#FFE08A';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx - bw, top); ctx.lineTo(bx + bw, top); ctx.stroke();

      pill(ctx, x, g.knee.y + sw * 0.28, '抬' + LEG_NAME[leg], '#FFFFFF', '#1F2A24', 24);
    }

    // ---------- 環島旅程 ----------
    drawTrip(fr) {
      const ctx = this.ctx;
      // 寬螢幕放在右上角（長輩正面坐在中間，不要擋到臉）；窄螢幕放在卡片下方；tripBox 可指定位置（遊戲說明用）
      const wide = this.w >= 980;
      const box = this.tripBox;
      const x0 = box ? box.side : wide ? Math.round(this.w * 0.6) : 16;
      const x1 = box ? this.w - box.side : wide ? this.w - 170 : this.w - 16;
      const y0 = box ? box.top : wide ? 12 : 200;
      const h = box ? box.h : wide ? 140 : 120;
      const w = x1 - x0;
      if (w < 200) return;
      this.dist += (fr.dist - this.dist) * 0.06;
      const unit = w / 3.2;
      const bikeX = x0 + w * 0.3;
      const roadY = y0 + h * 0.72;

      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 18); else ctx.rect(x0, y0, w, h);
      ctx.clip();
      const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
      sky.addColorStop(0, '#BFE3F2');
      sky.addColorStop(1, '#EAF6F0');
      ctx.fillStyle = sky;
      ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = '#FFE08A';
      ctx.beginPath(); ctx.arc(x1 - 50, y0 + 34, 16, 0, Math.PI * 2); ctx.fill();
      // 遠山（慢速捲動）
      ctx.fillStyle = '#9CCBA8';
      ctx.beginPath();
      ctx.moveTo(x0, roadY);
      for (let x = x0; x <= x1; x += 8) {
        const wx = (x - x0) + this.dist * unit * 0.3;
        ctx.lineTo(x, roadY - 22 - 16 * Math.sin(wx / 70) - 10 * Math.sin(wx / 31));
      }
      ctx.lineTo(x1, roadY);
      ctx.closePath();
      ctx.fill();
      // 道路
      ctx.fillStyle = '#7E8A85';
      ctx.fillRect(x0, roadY, w, h);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 16]);
      ctx.lineDashOffset = this.dist * unit;
      ctx.beginPath(); ctx.moveTo(x0, roadY + (y0 + h - roadY) / 2); ctx.lineTo(x1, roadY + (y0 + h - roadY) / 2); ctx.stroke();
      ctx.setLineDash([]);

      // 景點
      const cfg = fr.trip;
      const stops = [{ at: 0, name: cfg.start, id: 'kaohsiung' }].concat(cfg.stops);
      // 只差 1 下的兩站，後面那站的站名往下放，才不會疊在一起
      let prevLow = false;
      stops.forEach((s, i) => {
        const prev = stops[i - 1];
        const low = !!prev && s.at - prev.at <= 1 && !prevLow;
        prevLow = low;
        const sx = bikeX + (s.at - this.dist) * unit + unit * 0.35;
        if (sx < x0 - 80 || sx > x1 + 80) return;
        drawLandmark(ctx, s.id, sx, roadY, h * 0.5);
        pill(ctx, sx, y0 + (low ? 44 : 18), s.at === 0 ? '出發：' + s.name : s.name, '#FFFFFF', '#1F2A24', 16);
      });

      // 腳踏車
      drawBike(ctx, bikeX, roadY + 2, h * 0.36, this.dist * unit, fr.progress || 0);

      // 下一站
      const next = cfg.stops.find(s => s.at > fr.reps);
      const label = next ? '下一站：' + next.name + '，還有 ' + (next.at - fr.reps) + ' 下' : '環島完成！';
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

      // 抵達橫幅
      if (this.arrival) {
        const u = (performance.now() - this.arrival.t) / 2600;
        if (u >= 1) this.arrival = null;
        else {
          ctx.globalAlpha = u < 0.85 ? 1 : (1 - u) / 0.15;
          const sc = 1 + 0.06 * Math.sin(u * 20);
          pill(ctx, (x0 + x1) / 2, y0 + h + 34, '抵達 ' + this.arrival.name + '！', '#E0412F', '#FFFFFF', Math.round(30 * sc));
          ctx.globalAlpha = 1;
        }
      }
    }

    drawConfetti() {
      const ctx = this.ctx;
      this.confetti = this.confetti.filter(c => {
        c.x += c.vx; c.y += c.vy; c.vy += 0.15; c.life -= 0.012;
        if (c.life <= 0) return false;
        ctx.globalAlpha = c.life;
        ctx.fillStyle = c.c;
        ctx.fillRect(c.x, c.y, 8, 5);
        ctx.globalAlpha = 1;
        return true;
      });
    }
  }

  function drawBike(ctx, x, groundY, size, travel, push) {
    const r = size * 0.42;
    const back = { x: x - size * 0.55, y: groundY - r }, front = { x: x + size * 0.55, y: groundY - r };
    const crank = { x: x - size * 0.05, y: groundY - r * 0.95 };
    const seat = { x: x - size * 0.22, y: groundY - r - size * 0.55 };
    const bar = { x: x + size * 0.4, y: groundY - r - size * 0.6 };
    const spin = travel / r;
    ctx.lineCap = 'round';
    for (const w of [back, front]) {
      ctx.strokeStyle = '#2A3440'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = spin + i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(w.x - Math.cos(a) * r, w.y - Math.sin(a) * r); ctx.lineTo(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#E0412F';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(back.x, back.y); ctx.lineTo(crank.x, crank.y); ctx.lineTo(seat.x, seat.y + 6); ctx.lineTo(back.x, back.y);
    ctx.moveTo(crank.x, crank.y); ctx.lineTo(bar.x - 4, bar.y + 10); ctx.lineTo(seat.x, seat.y + 6);
    ctx.moveTo(bar.x - 4, bar.y + 10); ctx.lineTo(front.x, front.y);
    ctx.stroke();
    // 踏板
    const pa = spin * 0.6;
    const pedal = { x: crank.x + Math.cos(pa) * r * 0.45, y: crank.y + Math.sin(pa) * r * 0.45 };
    ctx.strokeStyle = '#2A3440'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(crank.x, crank.y); ctx.lineTo(pedal.x, pedal.y); ctx.stroke();
    // 騎士：身體、頭、腿
    const hip = { x: seat.x, y: seat.y - 2 };
    const shoulder = { x: seat.x + size * 0.28, y: seat.y - size * 0.55 };
    ctx.strokeStyle = '#6C8FB3'; ctx.lineWidth = size * 0.16;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(shoulder.x, shoulder.y); ctx.stroke();
    ctx.lineWidth = size * 0.09;
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(bar.x, bar.y); ctx.stroke();
    const knee = { x: (hip.x + pedal.x) / 2 + size * 0.18, y: (hip.y + pedal.y) / 2 - size * 0.1 * (1 + push) };
    ctx.strokeStyle = '#44566B'; ctx.lineWidth = size * 0.11;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(pedal.x, pedal.y); ctx.stroke();
    ctx.fillStyle = '#F1C9A5';
    ctx.beginPath(); ctx.arc(shoulder.x + size * 0.05, shoulder.y - size * 0.18, size * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#CFCFCF';
    ctx.beginPath(); ctx.arc(shoulder.x + size * 0.04, shoulder.y - size * 0.2, size * 0.13, Math.PI, Math.PI * 2); ctx.fill();
  }

  // 景點插畫（簡單的形狀，不用照片）
  function drawLandmark(ctx, id, x, groundY, s) {
    ctx.save();
    if (id === 'kaohsiung') {
      // 85 大樓
      ctx.fillStyle = '#5B7C99';
      ctx.fillRect(x - s * 0.28, groundY - s * 1.1, s * 0.2, s * 1.1);
      ctx.fillRect(x + s * 0.08, groundY - s * 1.1, s * 0.2, s * 1.1);
      ctx.fillRect(x - s * 0.28, groundY - s * 0.75, s * 0.56, s * 0.75);
      ctx.fillRect(x - s * 0.05, groundY - s * 1.45, s * 0.1, s * 0.4);
    } else if (id === 'kenting') {
      ctx.fillStyle = '#4F9BD9';
      ctx.fillRect(x - s * 0.9, groundY - s * 0.12, s * 1.8, s * 0.12);
      ctx.strokeStyle = '#8B5E3C'; ctx.lineWidth = s * 0.08;
      ctx.beginPath(); ctx.moveTo(x, groundY); ctx.quadraticCurveTo(x + s * 0.1, groundY - s * 0.5, x - s * 0.05, groundY - s * 0.95); ctx.stroke();
      ctx.fillStyle = '#3E8A55';
      for (const a of [-2.6, -2, -1.2, -0.5, 0.2]) {
        ctx.beginPath();
        ctx.ellipse(x - s * 0.05 + Math.cos(a) * s * 0.28, groundY - s * 0.95 + Math.sin(a) * s * 0.12, s * 0.3, s * 0.08, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'taroko') {
      ctx.fillStyle = '#8E9A96';
      ctx.beginPath(); ctx.moveTo(x - s * 0.9, groundY); ctx.lineTo(x - s * 0.7, groundY - s * 1.2); ctx.lineTo(x - s * 0.2, groundY - s * 1.05); ctx.lineTo(x - s * 0.15, groundY); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + s * 0.15, groundY); ctx.lineTo(x + s * 0.25, groundY - s * 1.15); ctx.lineTo(x + s * 0.75, groundY - s * 1.25); ctx.lineTo(x + s * 0.9, groundY); ctx.fill();
      ctx.fillStyle = '#7FC6D9';
      ctx.fillRect(x - s * 0.15, groundY - s * 0.1, s * 0.3, s * 0.1);
    } else if (id === 'taipei101') {
      ctx.fillStyle = '#4C9C62';
      for (let i = 0; i < 8; i++) {
        const y = groundY - s * 0.45 - i * s * 0.14;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.17, y + s * 0.14); ctx.lineTo(x - s * 0.21, y); ctx.lineTo(x + s * 0.21, y); ctx.lineTo(x + s * 0.17, y + s * 0.14);
        ctx.fill();
      }
      ctx.fillRect(x - s * 0.22, groundY - s * 0.45, s * 0.44, s * 0.45);
      ctx.fillRect(x - s * 0.03, groundY - s * 1.75, s * 0.06, s * 0.25);
    } else if (id === 'sunmoon') {
      ctx.fillStyle = '#4F9BD9';
      ctx.beginPath(); ctx.ellipse(x, groundY - s * 0.06, s * 0.95, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#C9573F';
      for (let i = 0; i < 4; i++) {
        const w = s * (0.32 - i * 0.06), y = groundY - s * 0.3 - i * s * 0.2;
        ctx.fillRect(x + s * 0.5 - w / 2, y, w, s * 0.16);
      }
      ctx.fillStyle = '#3E8A55';
      ctx.beginPath(); ctx.moveTo(x - s * 0.95, groundY - s * 0.1); ctx.lineTo(x - s * 0.5, groundY - s * 0.6); ctx.lineTo(x - s * 0.05, groundY - s * 0.1); ctx.fill();
    } else if (id === 'alishan') {
      ctx.fillStyle = '#6B4A32';
      ctx.fillRect(x - s * 0.12, groundY - s * 0.9, s * 0.24, s * 0.9);
      ctx.fillStyle = '#2F7A4A';
      ctx.beginPath(); ctx.arc(x, groundY - s * 1.05, s * 0.45, 0, Math.PI * 2); ctx.fill();
      // 小火車
      ctx.fillStyle = '#C9302C';
      ctx.fillRect(x + s * 0.35, groundY - s * 0.3, s * 0.55, s * 0.24);
      ctx.fillStyle = '#2A3440';
      ctx.beginPath(); ctx.arc(x + s * 0.48, groundY - s * 0.05, s * 0.06, 0, Math.PI * 2); ctx.arc(x + s * 0.78, groundY - s * 0.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
    }
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

  RCDD.BikeScene = BikeScene;
})(window);
