import { config } from './config.js';
import type { Track } from './track.js';
import type { Kart } from './kart.js';
import type { Action, KartInput } from './input.js';
import type { ItemSystem } from './items.js';

class AIInput implements KartInput {
  _down = new Set<Action>();
  _press = new Set<Action>();
  isDown(a: Action): boolean { return this._down.has(a); }
  wasPressed(a: Action): boolean { return this._press.has(a); }
}

export class AIController {
  kart: Kart;
  track: Track;
  index: number;
  speedBias: number;
  lineOffset: number;
  targetIndex = 4;
  itemUseTimer = 0;
  stuckTimer = 0;
  input: AIInput;

  constructor(kart: Kart, track: Track, index: number) {
    this.kart = kart;
    this.track = track;
    this.index = index;
    kart.aiIndex = index + 1;

    const r = mulberry32(1000 + index);
    const [lo, hi] = config.ai.speedJitter;
    this.speedBias = lo + r() * (hi - lo);
    this.lineOffset = (r() * 2 - 1) * config.ai.lineOffsetRange;

    this.input = new AIInput();
  }

  set(action: Action, on: boolean): void {
    if (on) this.input._down.add(action);
    else this.input._down.delete(action);
  }

  press(action: Action): void { this.input._press.add(action); }

  update(dt: number, _items: ItemSystem, allKarts: Kart[]): void {
    this.input._press.clear();

    const k = this.kart;
    const trackSamples = this.track.samples.length;

    const advanceDist = config.ai.waypointReachDistance;
    while (true) {
      const wp = this.track.getWaypoint(this.targetIndex, this.lineOffset);
      const dx = wp.x - k.position.x;
      const dz = wp.z - k.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < advanceDist) {
        this.targetIndex = (this.targetIndex + 1) % trackSamples;
      } else break;
    }

    const wp = this.track.getWaypoint(this.targetIndex, this.lineOffset);
    const wpAhead = this.track.getWaypoint(this.targetIndex + 4, this.lineOffset);
    const targetX = (wp.x + wpAhead.x) / 2;
    const targetZ = (wp.z + wpAhead.z) / 2;
    const dx = targetX - k.position.x;
    const dz = targetZ - k.position.z;
    const desiredHeading = Math.atan2(dx, dz);

    const delta = wrapAngle(desiredHeading - k.heading);
    const absDelta = Math.abs(delta);

    this.set('left', delta > 0.05);
    this.set('right', delta < -0.05);
    this.set('accel', absDelta < 1.6);
    this.set('brake', absDelta > 2.4);

    const tightTurn = absDelta > 0.5;
    this.set('drift', tightTurn && Math.abs(k.speed) > 12);

    if (Math.abs(k.speed) < 1.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.set('accel', false);
        this.set('brake', true);
        if (this.stuckTimer > 1.7) this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }

    const playerKart = allKarts.find(kk => kk.isPlayer);
    if (playerKart) {
      const myProgress = k.totalProgress;
      const playerProgress = playerKart.totalProgress;
      if (myProgress < playerProgress - 8) {
        k.aiAccelBonus = config.ai.rubberbandBehind;
      } else if (myProgress > playerProgress + 12) {
        k.aiAccelBonus = config.ai.rubberbandAhead;
      } else {
        k.aiAccelBonus = 0;
      }
    }

    if (k.heldItem && this.itemUseTimer <= 0) {
      const [lo, hi] = config.ai.itemDelayRange;
      this.itemUseTimer = lo + Math.random() * (hi - lo);
    }
    if (this.itemUseTimer > 0) {
      this.itemUseTimer -= dt;
      if (this.itemUseTimer <= 0 && k.heldItem) {
        this.press('item');
      }
    }
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
