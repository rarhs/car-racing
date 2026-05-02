import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Track, Wall } from '../../src/track.js';
import { config } from '../../src/config.js';
import { makeKart } from '../helpers/stubs.js';

function trackWithWalls(walls: Wall[]): Track {
  return {
    samples: [], tangents: [], roadHalfWidth: 6, walls,
    finishLineCenter: new THREE.Vector3(),
    finishLineNormal: new THREE.Vector3(),
    itemBoxSpawns: [],
    getStartPositions: () => [],
    nearestSampleIndex: () => ({ index: 0, distSq: 0 }),
    isOffTrack: () => false,
    updateProgress: () => {},
    getWaypoint: () => new THREE.Vector3(),
    getTangent: () => new THREE.Vector3(),
  };
}

describe('Kart.resolveWallCollisions', () => {
  it('pushes the kart out of a wall it overlaps', () => {
    const scene = new THREE.Scene();
    const r = config.kart.radius;
    // Wall along z-axis at x=0.
    const wall: Wall = {
      a: new THREE.Vector3(0, 0, -5),
      b: new THREE.Vector3(0, 0, 5),
      normal: new THREE.Vector3(1, 0, 0),
    };
    const track = trackWithWalls([wall]);
    // Place kart partially overlapping the wall (x=0.5, less than radius from x=0).
    const kart = makeKart(scene, new THREE.Vector3(0.5, 0, 0));
    kart.speed = 20;

    kart.resolveWallCollisions(track);

    expect(Math.abs(kart.position.x)).toBeGreaterThanOrEqual(r);
    expect(kart.speed).toBeCloseTo(20 * config.kart.wallBounceDamp, 5);
  });

  it('does nothing when the kart is clear of all walls', () => {
    const scene = new THREE.Scene();
    const wall: Wall = {
      a: new THREE.Vector3(10, 0, -5),
      b: new THREE.Vector3(10, 0, 5),
      normal: new THREE.Vector3(-1, 0, 0),
    };
    const track = trackWithWalls([wall]);
    const kart = makeKart(scene, new THREE.Vector3(0, 0, 0));
    kart.speed = 20;
    const before = kart.position.clone();

    kart.resolveWallCollisions(track);

    expect(kart.position.x).toBe(before.x);
    expect(kart.position.z).toBe(before.z);
    expect(kart.speed).toBe(20);
  });

  it('ignores zero-length wall segments', () => {
    const scene = new THREE.Scene();
    const wall: Wall = {
      a: new THREE.Vector3(0, 0, 0),
      b: new THREE.Vector3(0, 0, 0),
      normal: new THREE.Vector3(1, 0, 0),
    };
    const track = trackWithWalls([wall]);
    const kart = makeKart(scene, new THREE.Vector3(0.1, 0, 0));
    kart.speed = 20;
    const before = kart.position.clone();

    kart.resolveWallCollisions(track);

    expect(kart.position.x).toBe(before.x);
    expect(kart.speed).toBe(20);
  });
});

describe('Kart.hit', () => {
  it('absorbs a hit when shielded and consumes the shield', () => {
    const scene = new THREE.Scene();
    const kart = makeKart(scene, new THREE.Vector3());
    kart.activateShield(5);
    expect(kart.shieldTimer).toBeGreaterThan(0);

    const landed = kart.hit('spin');

    expect(landed).toBe(false);
    expect(kart.shieldTimer).toBe(0);
    expect(kart.spinTimer).toBe(0);
  });

  it('spins the kart when not shielded', () => {
    const scene = new THREE.Scene();
    const kart = makeKart(scene, new THREE.Vector3());
    kart.speed = 15;

    const landed = kart.hit('spin');

    expect(landed).toBe(true);
    expect(kart.spinTimer).toBe(config.items.banana.spinDuration);
    expect(kart.speed).toBeLessThanOrEqual(0);
  });
});

describe('Kart held items', () => {
  it('giveItem only takes effect when no item is held', () => {
    const scene = new THREE.Scene();
    const kart = makeKart(scene, new THREE.Vector3());
    kart.giveItem('boost');
    expect(kart.heldItem).toBe('boost');
    kart.giveItem('banana');
    expect(kart.heldItem).toBe('boost');
  });

  it('consumeItem clears the slot', () => {
    const scene = new THREE.Scene();
    const kart = makeKart(scene, new THREE.Vector3());
    kart.giveItem('shield');
    expect(kart.consumeItem()).toBe('shield');
    expect(kart.heldItem).toBeNull();
    expect(kart.consumeItem()).toBeNull();
  });
});
