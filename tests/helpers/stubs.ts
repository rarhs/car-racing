import * as THREE from 'three';
import type { Assets, PropName } from '../../src/assets.js';
import type { Action, KartInput } from '../../src/input.js';
import type { Hud } from '../../src/hud.js';
import { Kart } from '../../src/kart.js';

const PROP_NAMES: PropName[] = [
  'itemBox', 'barrierRed', 'barrierWhite', 'flagCheckers',
  'grandStand', 'billboard', 'tree', 'treeSmall',
];

export function makeStubAssets(): Assets {
  const props = Object.fromEntries(
    PROP_NAMES.map((k) => [k, new THREE.Group()]),
  ) as Record<PropName, THREE.Group>;
  return {
    karts: {
      player: new THREE.Group(),
      ai: [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()],
    },
    props,
  };
}

export class TestInput implements KartInput {
  private down = new Set<Action>();
  private press = new Set<Action>();
  isDown(a: Action): boolean { return this.down.has(a); }
  wasPressed(a: Action): boolean { return this.press.has(a); }
  hold(a: Action): void { this.down.add(a); }
  release(a: Action): void { this.down.delete(a); }
  tap(a: Action): void { this.press.add(a); }
  endFrame(): void { this.press.clear(); }
}

export interface ToastSpy { calls: string[] }

export function makeStubHud(): { hud: Hud; toasts: ToastSpy } {
  const toasts: ToastSpy = { calls: [] };
  const hud = { toast: (msg: string) => { toasts.calls.push(msg); } } as unknown as Hud;
  return { hud, toasts };
}

export function makeKart(scene: THREE.Scene, position: THREE.Vector3, heading = 0, isPlayer = true): Kart {
  return new Kart({
    scene,
    model: new THREE.Group(),
    position,
    heading,
    isPlayer,
    color: 0xff0000,
  });
}
