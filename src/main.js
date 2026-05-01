import * as THREE from 'three';
import { input } from './input.js';
import { loadAssets } from './assets.js';
import { buildTrack } from './track.js';
import { Kart } from './kart.js';
import { ChaseCamera } from './camera.js';
import { ItemSystem } from './items.js';
import { AIController } from './ai.js';
import { Hud } from './hud.js';
import { GameState } from './state.js';
import { config } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x9ad7ff);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ad7ff, 100, 350);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(40, 80, 30);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const camera = new THREE.PerspectiveCamera(config.camera.fovBase, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const hud = new Hud();
const state = new GameState();

let assets, track, items, player, ais = [], chaseCam;

async function boot() {
  state.set('loading');
  hud.showLoading('Loading assets…');
  assets = await loadAssets((p) => hud.showLoading(`Loading… ${Math.round(p * 100)}%`));
  hud.hideLoading();

  track = buildTrack(scene, assets);
  items = new ItemSystem(scene, assets, track);

  setupRace();
  state.set('countdown', { seconds: config.race.countdownSeconds });
}

function setupRace() {
  if (player) player.dispose(scene);
  for (const a of ais) a.kart.dispose(scene);
  ais = [];

  const startPositions = track.getStartPositions(5);

  player = new Kart({
    scene,
    model: assets.karts.player.clone(),
    position: startPositions[0].position,
    heading: startPositions[0].heading,
    isPlayer: true,
    color: 0xff4444,
  });

  for (let i = 0; i < 4; i++) {
    const k = new Kart({
      scene,
      model: assets.karts.ai[i].clone(),
      position: startPositions[i + 1].position,
      heading: startPositions[i + 1].heading,
      isPlayer: false,
      color: [0x4488ff, 0x44dd66, 0xffaa33, 0xcc66ff][i],
    });
    ais.push({ kart: k, controller: new AIController(k, track, i) });
  }

  chaseCam = new ChaseCamera(camera, player);
  items.reset();

  raceTime = 0;
  lapStartTime = 0;
  prevPlayerLap = -1;
  bestLapTime = null;

  isPaused = false;
  hud.hidePause();
}

const clock = new THREE.Clock();
let countdownTimer = 0;
let raceTime = 0;
let lapStartTime = 0;
let prevPlayerLap = -1;
let bestLapTime = null;
let isPaused = false;

function frame(dt) {
  if ((state.is('race') || state.is('countdown')) && input.wasPressed('pause')) {
    isPaused = !isPaused;
    if (isPaused) hud.showPause(); else hud.hidePause();
  }

  if (isPaused) {
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }

  if (state.is('countdown')) {
    countdownTimer += dt;
    const remaining = config.race.countdownSeconds - countdownTimer;
    if (remaining <= 0) {
      hud.showCenter('GO!', 0.6);
      state.set('race');
    } else {
      hud.showCenter(String(Math.ceil(remaining)));
    }
  }

  if (state.is('race') || state.is('countdown')) {
    const allow = state.is('race');
    if (allow) player.update(dt, input, track);
    else player.idle(dt);

    for (const a of ais) {
      if (allow) a.controller.update(dt, items, [player, ...ais.map(x => x.kart)]);
      else a.kart.idle(dt);
      a.kart.update(dt, a.controller.input, track);
    }

    items.update(dt, [player, ...ais.map(x => x.kart)], hud);

    track.updateProgress(player);
    for (const a of ais) track.updateProgress(a.kart);

    chaseCam.update(dt);

    if (state.is('race')) {
      raceTime += dt;
      if (player.lap !== prevPlayerLap) {
        if (prevPlayerLap >= 0) {
          const lapTime = raceTime - lapStartTime;
          if (bestLapTime === null || lapTime < bestLapTime) bestLapTime = lapTime;
        }
        lapStartTime = raceTime;
        prevPlayerLap = player.lap;
      }
    }
    const currentLapElapsed = player.lap >= 0 && state.is('race')
      ? raceTime - lapStartTime
      : null;

    const allKarts = [player, ...ais.map(x => x.kart)];
    const ranking = [...allKarts].sort((a, b) => b.totalProgress - a.totalProgress);
    const playerPos = ranking.indexOf(player) + 1;
    hud.setLap(player.lap + 1, config.race.laps);
    hud.setPosition(playerPos, allKarts.length);
    hud.setSpeed(Math.round(player.speed * 4));
    hud.setItem(player.heldItem);
    hud.setLapTimes(currentLapElapsed, bestLapTime);

    if (state.is('race')) {
      const finished = allKarts.filter(k => k.lap >= config.race.laps);
      if (finished.length === allKarts.length || (player.lap >= config.race.laps && finished.length >= 1)) {
        state.set('results');
        hud.showResults(ranking);
      }
    }
  }

  if (state.is('results') && input.wasPressed('restart')) {
    hud.hideResults();
    countdownTimer = 0;
    setupRace();
    state.set('countdown');
  }

  input.endFrame();
  renderer.render(scene, camera);
}

let animatePaused = false;
function animate() {
  requestAnimationFrame(animate);
  if (animatePaused) { clock.getDelta(); return; }
  const dt = Math.min(clock.getDelta(), 1 / 30);
  frame(dt);
}

const startPaused = new URLSearchParams(location.search).has('paused');
boot().then(() => {
  if (startPaused) animatePaused = true;
  animate();
  window.__game = {
    get player() { return player; },
    get ais() { return ais; },
    get state() { return state.current; },
    get items() { return items; },
    get track() { return track; },
    get countdownTimer() { return countdownTimer; },
    tick(dt = 1 / 60, steps = 1) {
      for (let i = 0; i < steps; i++) frame(dt);
      renderer.render(scene, camera);
    },
    setCountdownDone() { countdownTimer = 999; },
    pause() { animatePaused = true; },
    resume() { animatePaused = false; },
  };
});
