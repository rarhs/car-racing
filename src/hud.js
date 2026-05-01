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
    this.centerTimer = 0;
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
    ranking.forEach((kart, i) => {
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
