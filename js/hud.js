import * as THREE from './three.module.js';

// ---------------------------------------------------------------------------
// HUD: DOM overlays (position, lap, countdown, item box, results) plus
// canvas-drawn minimap and speedometer.
// ---------------------------------------------------------------------------

const ORD = ['st', 'nd', 'rd', 'th', 'th', 'th'];

export class HUD {
  constructor(track) {
    this.track = track;
    this.el = {
      hud: document.getElementById('hud'),
      position: document.getElementById('position'),
      lap: document.getElementById('lap'),
      center: document.getElementById('center-msg'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      speedNum: document.getElementById('speed-num'),
      itemSlot: document.getElementById('item-slot'),
      itemBox: document.getElementById('item-box'),
      boostFill: document.getElementById('boost-fill'),
      overlay: document.getElementById('overlay'),
      overlayCard: document.getElementById('overlay-card'),
      startBtn: document.getElementById('start-btn'),
      results: document.getElementById('results'),
      loading: document.getElementById('loading'),
    };
    this.mmCtx = this.el.minimap.getContext('2d');
    this.soCtx = this.el.speedo.getContext('2d');
    this._buildMinimapPath();
    this._itemIcons = { boost: '🍄', shell: '🐚', shield: '🛡️', banana: '🍌' };
  }

  _buildMinimapPath() {
    // Precompute the track outline in minimap space.
    const W = 180, H = 180, pad = 18;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.track.points.length; i++) {
      const p = this.track.points[i];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    this.mm = { scale, minX, minZ, W, H, pad };
    this.mmPath = [];
    for (let i = 0; i < this.track.points.length; i += 8) {
      const p = this.track.points[i];
      this.mmPath.push([
        (p.x - minX) * scale + pad,
        (p.z - minZ) * scale + pad,
      ]);
    }
  }

  _mmPos(p) {
    const { scale, minX, minZ, pad } = this.mm;
    return [(p.x - minX) * scale + pad, (p.z - minZ) * scale + pad];
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  // ---------- Minimap ----------
  drawMinimap(cars, player) {
    const ctx = this.mmCtx;
    const { W, H } = this.mm;
    ctx.clearRect(0, 0, W, H);
    // Track ribbon.
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < this.mmPath.length; i++) {
      const [x, y] = this.mmPath[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // Start line.
    const [sx, sy] = this._mmPos(this.track.checkpoints[0].pos);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    // Cars.
    for (const car of cars) {
      const [x, y] = this._mmPos(car.pos);
      ctx.beginPath();
      ctx.arc(x, y, car === player ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = car === player ? '#ffd23f' : (car.shielded ? '#66ccff' : '#ff5c33');
      ctx.fill();
      if (car === player) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  // ---------- Speedometer ----------
  drawSpeedo(speed) {
    const ctx = this.soCtx;
    const W = 150, H = 150, cx = 75, cy = 75, r = 62;
    ctx.clearRect(0, 0, W, H);
    const maxK = 180; // km/h display max
    const kmh = Math.abs(speed) * 3.6;
    const startA = Math.PI * 0.75;
    const endA = Math.PI * 2.25;
    // Background arc.
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.stroke();
    // Value arc.
    const frac = Math.min(1, kmh / maxK);
    const valA = startA + (endA - startA) * frac;
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#ff5c33');
    grad.addColorStop(1, '#ffd23f');
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, valA);
    ctx.stroke();
    // Ticks.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
      const a = startA + (endA - startA) * (i / 6);
      const x1 = cx + Math.cos(a) * (r - 8), y1 = cy + Math.sin(a) * (r - 8);
      const x2 = cx + Math.cos(a) * (r - 16), y2 = cy + Math.sin(a) * (r - 16);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    this.el.speedNum.textContent = Math.round(kmh);
  }

  // ---------- Text HUD ----------
  updateText(player, lap, totalLaps) {
    const pos = player.racePos;
    this.el.position.innerHTML = pos + '<span class="ord">' + ORD[(pos - 1) % 5] + '</span>';
    this.el.lap.textContent = `LAP ${Math.min(lap + 1, totalLaps)}/${totalLaps}`;
    // Item box.
    if (player.item) {
      this.el.itemSlot.textContent = this._itemIcons[player.item] || '?';
      this.el.itemBox.classList.add('has-item');
    } else {
      this.el.itemSlot.textContent = '?';
      this.el.itemBox.classList.remove('has-item');
    }
    // Boost bar.
    const bf = player.boosting ? Math.max(0, (player._boostUntil || 0) / 1.6) : 0;
    this.el.boostFill.style.width = (bf * 100) + '%';
  }

  // ---------- Messages ----------
  message(text, cls = 'go', duration = 1.2) {
    this.el.center.textContent = text;
    this.el.center.className = cls;
    this._msgTimer = duration;
  }
  tick(dt) {
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.el.center.textContent = '';
    }
  }

  // ---------- Overlay ----------
  showStart() {
    this.el.overlay.classList.remove('hidden');
    this.el.results.classList.add('hidden');
    this.el.startBtn.classList.remove('hidden');
  }
  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  showResults(race) {
    this.el.overlay.classList.remove('hidden');
    this.el.startBtn.classList.add('hidden');
    const res = this.el.results;
    const sorted = [...race.cars].sort((a, b) => a.racePos - b.racePos);
    let html = '<table>';
    sorted.forEach((car) => {
      const time = car.isPlayer && car.finished ? this._fmt(car.finishTime) : '—';
      const cls = car.isPlayer ? ' class="you"' : '';
      html += `<tr><td class="rank">${car.racePos}</td><td${cls}>${car.name}</td><td>${time}</td></tr>`;
    });
    html += '</table>';
    const player = race.player;
    if (player.finished) {
      html += `<div class="best">Your best lap: ${this._fmt(Math.min(...player.lapTimes))}</div>`;
    }
    res.innerHTML = html;
  }

  _fmt(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
}