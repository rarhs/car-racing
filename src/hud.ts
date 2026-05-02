import type { Track } from './track.js';
import type { Kart, ItemName } from './kart.js';

const itemEmoji: Record<ItemName, string> = {
  boost: '⚡',
  banana: '🍌',
  missile: '🚀',
  shield: '🛡️',
};

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required HUD element #${id}`);
  return el as T;
}

interface MinimapBounds {
  minX: number;
  minZ: number;
  scale: number;
  cx: number;
  cz: number;
}

export class Hud {
  lapEl: HTMLElement;
  posEl: HTMLElement;
  itemEl: HTMLElement;
  itemIconEl: HTMLElement;
  speedEl: HTMLElement;
  centerEl: HTMLElement;
  resultsEl: HTMLElement;
  resultsListEl: HTMLElement;
  loadingEl: HTMLElement;
  lapTimeCurrentEl: HTMLElement;
  lapTimeBestEl: HTMLElement;
  pauseEl: HTMLElement;
  minimapCanvas: HTMLCanvasElement;
  minimapCtx: CanvasRenderingContext2D | null;
  minimapBounds: MinimapBounds | null = null;
  centerTimer = 0;
  private _centerHide: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.lapEl = requireEl('hud-lap');
    this.posEl = requireEl('hud-position');
    this.itemEl = requireEl('hud-item');
    this.itemIconEl = requireEl('item-icon');
    this.speedEl = requireEl('hud-speed');
    this.centerEl = requireEl('hud-center');
    this.resultsEl = requireEl('hud-results');
    this.resultsListEl = requireEl('results-list');
    this.loadingEl = requireEl('hud-loading');
    this.lapTimeCurrentEl = requireEl('laptime-current');
    this.lapTimeBestEl = requireEl('laptime-best');
    this.pauseEl = requireEl('hud-pause');
    this.minimapCanvas = requireEl<HTMLCanvasElement>('hud-minimap');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
  }

  showPause(): void { this.pauseEl.classList.remove('hidden'); }
  hidePause(): void { this.pauseEl.classList.add('hidden'); }

  drawMinimap(track: Track, karts: Kart[], player: Kart | null): void {
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
    const project = (p: { x: number; z: number }) => ({ x: cx + (p.x - minX) * scale, y: cz + (p.z - minZ) * scale });

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

  setLap(cur: number, total: number): void { this.lapEl.textContent = `LAP ${Math.min(cur, total)}/${total}`; }

  setLapTimes(currentSec: number | null, bestSec: number | null): void {
    this.lapTimeCurrentEl.textContent = formatLapTime(currentSec);
    this.lapTimeBestEl.textContent = formatLapTime(bestSec);
  }
  setPosition(pos: number, total: number): void {
    const suffix = ['st','nd','rd'][pos - 1] || 'th';
    this.posEl.textContent = `${pos}${suffix} of ${total}`;
  }
  setSpeed(s: number): void { this.speedEl.textContent = String(s); }

  setItem(item: ItemName | null): void {
    if (item) {
      this.itemEl.classList.add('has-item');
      this.itemIconEl.textContent = itemEmoji[item] ?? '?';
    } else {
      this.itemEl.classList.remove('has-item');
      this.itemIconEl.textContent = '—';
    }
  }

  showCenter(text: string, holdSeconds = 0): void {
    this.centerEl.textContent = text;
    this.centerEl.classList.remove('toast');
    if (holdSeconds > 0) {
      if (this._centerHide) clearTimeout(this._centerHide);
      this._centerHide = setTimeout(() => { this.centerEl.textContent = ''; }, holdSeconds * 1000);
    }
  }

  toast(text: string, durationSec = 1.2): void {
    this.centerEl.textContent = text;
    this.centerEl.classList.add('toast');
    if (this._centerHide) clearTimeout(this._centerHide);
    this._centerHide = setTimeout(() => {
      this.centerEl.textContent = '';
      this.centerEl.classList.remove('toast');
    }, durationSec * 1000);
  }

  showResults(ranking: Kart[]): void {
    this.resultsListEl.innerHTML = '';
    ranking.forEach((kart) => {
      const li = document.createElement('li');
      li.textContent = `${kart.isPlayer ? 'You' : `CPU ${kart.aiIndex ?? ''}`}`;
      this.resultsListEl.appendChild(li);
    });
    this.resultsEl.classList.remove('hidden');
  }

  hideResults(): void { this.resultsEl.classList.add('hidden'); }

  showLoading(msg: string): void {
    this.loadingEl.textContent = msg;
    this.loadingEl.classList.remove('hidden');
  }
  hideLoading(): void { this.loadingEl.classList.add('hidden'); }
}

function formatLapTime(sec: number | null): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  const hundredths = Math.floor((sec - m * 60 - s) * 100);
  return `${m}:${String(s).padStart(2, '0')}:${String(hundredths).padStart(2, '0')}`;
}
