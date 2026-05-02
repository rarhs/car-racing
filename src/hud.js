const itemEmoji = {
  boost: '⚡',
  banana: '🍌',
  missile: '🚀',
  shield: '🛡️',
};

export class Hud {
  constructor() {
    this.lapEl = document.getElementById('hud-lap');
    this.posEl = document.getElementById('hud-position');
    this.itemEl = document.getElementById('hud-item');
    this.itemIconEl = document.getElementById('item-icon');
    this.speedEl = document.getElementById('hud-speed');
    this.centerEl = document.getElementById('hud-center');
    this.resultsEl = document.getElementById('hud-results');
    this.resultsListEl = document.getElementById('results-list');
    this.loadingEl = document.getElementById('hud-loading');
    this.lapTimeCurrentEl = document.getElementById('laptime-current');
    this.lapTimeBestEl = document.getElementById('laptime-best');
    this.pauseEl = document.getElementById('hud-pause');
    this.minimapCanvas = document.getElementById('hud-minimap');
    this.minimapCtx = this.minimapCanvas?.getContext('2d') || null;
    this.minimapBounds = null;
    this.centerTimer = 0;
  }

  showPause() { if (this.pauseEl) this.pauseEl.classList.remove('hidden'); }
  hidePause() { if (this.pauseEl) this.pauseEl.classList.add('hidden'); }

  drawMinimap(track, karts, player) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const samples = track.samples;

    if (!this.minimapBounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const s of samples) {
        if (s.x < minX) minX = s.x;
        if (s.x > maxX) maxX = s.x;
        if (s.z < minZ) minZ = s.z;
        if (s.z > maxZ) maxZ = s.z;
      }
      const pad = 12;
      const sx = (W - 2 * pad) / (maxX - minX);
      const sz = (H - 2 * pad) / (maxZ - minZ);
      const scale = Math.min(sx, sz);
      const cx = (W - (maxX - minX) * scale) / 2;
      const cz = (H - (maxZ - minZ) * scale) / 2;
      this.minimapBounds = { minX, minZ, scale, cx, cz };
    }
    const { minX, minZ, scale, cx, cz } = this.minimapBounds;
    const project = (p) => ({ x: cx + (p.x - minX) * scale, y: cz + (p.z - minZ) * scale });

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= samples.length; i++) {
      const p = project(samples[i % samples.length]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    const finish = project(samples[0]);
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(finish.x, finish.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    for (const k of karts) {
      if (k === player) continue;
      const p = project(k.position);
      ctx.fillStyle = '#' + (k.color ?? 0xffffff).toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (player) {
      const p = project(player.position);
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  setLap(cur, total) { this.lapEl.textContent = `LAP ${Math.min(cur, total)}/${total}`; }

  setLapTimes(currentSec, bestSec) {
    if (this.lapTimeCurrentEl) this.lapTimeCurrentEl.textContent = formatLapTime(currentSec);
    if (this.lapTimeBestEl) this.lapTimeBestEl.textContent = formatLapTime(bestSec);
  }
  setPosition(pos, total) {
    const suffix = ['st','nd','rd'][pos - 1] || 'th';
    this.posEl.textContent = `${pos}${suffix} of ${total}`;
  }
  setSpeed(s) { this.speedEl.textContent = String(s); }

  setItem(item) {
    if (item) {
      this.itemEl.classList.add('has-item');
      this.itemIconEl.textContent = itemEmoji[item] || '?';
    } else {
      this.itemEl.classList.remove('has-item');
      this.itemIconEl.textContent = '—';
    }
  }

  showCenter(text, holdSeconds = 0) {
    this.centerEl.textContent = text;
    this.centerEl.classList.remove('toast');
    if (holdSeconds > 0) {
      clearTimeout(this._centerHide);
      this._centerHide = setTimeout(() => { this.centerEl.textContent = ''; }, holdSeconds * 1000);
    }
  }

  toast(text, durationSec = 1.2) {
    this.centerEl.textContent = text;
    this.centerEl.classList.add('toast');
    clearTimeout(this._centerHide);
    this._centerHide = setTimeout(() => {
      this.centerEl.textContent = '';
      this.centerEl.classList.remove('toast');
    }, durationSec * 1000);
  }

  showResults(ranking) {
    this.resultsListEl.innerHTML = '';
    ranking.forEach((kart) => {
      const li = document.createElement('li');
      li.textContent = `${kart.isPlayer ? 'You' : `CPU ${kart.aiIndex ?? ''}`}`;
      this.resultsListEl.appendChild(li);
    });
    this.resultsEl.classList.remove('hidden');
  }

  hideResults() { this.resultsEl.classList.add('hidden'); }

  showLoading(msg) {
    this.loadingEl.textContent = msg;
    this.loadingEl.classList.remove('hidden');
  }
  hideLoading() { this.loadingEl.classList.add('hidden'); }
}

function formatLapTime(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  const hundredths = Math.floor((sec - m * 60 - s) * 100);
  return `${m}:${String(s).padStart(2, '0')}:${String(hundredths).padStart(2, '0')}`;
}
