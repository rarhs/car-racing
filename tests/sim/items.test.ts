import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Kart } from '../../src/kart.js';
import { ItemSystem } from '../../src/items.js';
import { config } from '../../src/config.js';
import { buildTrackHeadless } from '../../src/track.js';
import { makeStubAssets, makeStubHud } from '../helpers/stubs.js';

function setup() {
  const scene = new THREE.Scene();
  const assets = makeStubAssets();
  const track = buildTrackHeadless();
  const items = new ItemSystem(scene, assets, track);
  return { scene, assets, track, items };
}

function makePlayer(scene: THREE.Scene, position: THREE.Vector3): Kart {
  return new Kart({
    scene,
    model: new THREE.Group(),
    position,
    heading: 0,
    isPlayer: true,
    color: 0xff0000,
  });
}

describe('ItemSystem item box pickup', () => {
  it('grants an item when a kart drives over a box', () => {
    const { scene, items } = setup();
    const { hud } = makeStubHud();
    const boxPos = items.itemBoxes[0].position;
    const kart = makePlayer(scene, boxPos.clone());

    expect(kart.heldItem).toBeNull();
    items.update(1 / 60, [kart], hud);

    expect(kart.heldItem).not.toBeNull();
    expect(items.itemBoxes[0].alive).toBe(false);
  });

  it('respawns the box after the configured delay', () => {
    const { scene, items } = setup();
    const { hud } = makeStubHud();
    const boxPos = items.itemBoxes[0].position;
    const kart = makePlayer(scene, boxPos.clone());

    items.update(1 / 60, [kart], hud);
    expect(items.itemBoxes[0].alive).toBe(false);

    // Move kart away so it doesn't immediately re-pick on respawn.
    kart.position.set(9999, 0, 9999);
    const dt = 1 / 60;
    const frames = Math.ceil(config.items.boxRespawnSeconds / dt) + 2;
    for (let i = 0; i < frames; i++) items.update(dt, [kart], hud);

    expect(items.itemBoxes[0].alive).toBe(true);
  });
});

describe('Banana hazard', () => {
  it('spins a kart that drives into a dropped banana', () => {
    const { scene, items } = setup();
    const { hud, toasts } = makeStubHud();

    const dropper = makePlayer(scene, new THREE.Vector3(0, 0, 0));
    dropper.giveItem('banana');
    dropper.useItemRequested = true;
    items.update(1 / 60, [dropper], hud);
    expect(items.hazards.length).toBe(1);

    // Tick past the spawn-grace window so the dropper's own banana can hit other karts immediately.
    const victim = makePlayer(scene, items.hazards[0].position.clone());
    items.update(1 / 60, [dropper, victim], hud);

    expect(victim.spinTimer).toBeGreaterThan(0);
    expect(items.hazards.length).toBe(0);
    expect(toasts.calls).toContain('Banana hit!');
  });

  it('does NOT hit the owner during the spawn-grace window', () => {
    const { scene, items } = setup();
    const { hud } = makeStubHud();

    const dropper = makePlayer(scene, new THREE.Vector3(0, 0, 0));
    dropper.giveItem('banana');
    dropper.useItemRequested = true;
    items.update(1 / 60, [dropper], hud);
    // Owner sitting on top of their own banana right after dropping it.
    dropper.position.copy(items.hazards[0].position);
    items.update(1 / 60, [dropper], hud);

    expect(dropper.spinTimer).toBe(0);
    expect(items.hazards.length).toBe(1);
  });
});

describe('Boost item use', () => {
  it('activates boost on use', () => {
    const { scene, items } = setup();
    const { hud } = makeStubHud();
    const kart = makePlayer(scene, new THREE.Vector3(0, 0, 0));
    kart.giveItem('boost');
    kart.useItemRequested = true;

    items.update(1 / 60, [kart], hud);

    expect(kart.boostTimer).toBeCloseTo(config.items.boost.duration, 5);
    expect(kart.heldItem).toBeNull();
  });
});

describe('Shield item use', () => {
  it('activates shield and absorbs the next hit', () => {
    const { scene, items } = setup();
    const { hud } = makeStubHud();
    const kart = makePlayer(scene, new THREE.Vector3(0, 0, 0));
    kart.giveItem('shield');
    kart.useItemRequested = true;
    items.update(1 / 60, [kart], hud);
    expect(kart.shieldTimer).toBeGreaterThan(0);

    const landed = kart.hit('spin');
    expect(landed).toBe(false);
    expect(kart.spinTimer).toBe(0);
    expect(kart.shieldTimer).toBe(0);
  });
});
