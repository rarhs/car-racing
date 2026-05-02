import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Kart } from '../../src/kart.js';
import { config } from '../../src/config.js';
import { buildTrackHeadless } from '../../src/track.js';
import { TestInput } from '../helpers/stubs.js';

function spawnKart(): { kart: Kart; track: ReturnType<typeof buildTrackHeadless>; input: TestInput } {
  const track = buildTrackHeadless();
  // Spawn well inside the road on a long straight section, facing along the tangent.
  // Avoids the start grid (which sits behind the finish line near wraparound walls)
  // and gives clean physics conditions.
  const sampleIdx = 10;
  const pos = track.samples[sampleIdx].clone();
  const t = track.tangents[sampleIdx];
  const heading = Math.atan2(t.x, t.z);
  const scene = new THREE.Scene();
  const kart = new Kart({
    scene,
    model: new THREE.Group(),
    position: pos,
    heading,
    isPlayer: true,
    color: 0xff0000,
  });
  return { kart, track, input: new TestInput() };
}

function step(kart: Kart, input: TestInput, track: ReturnType<typeof buildTrackHeadless>, dt: number, frames: number): void {
  for (let i = 0; i < frames; i++) {
    kart.update(dt, input, track);
    input.endFrame();
  }
}

describe('Kart acceleration', () => {
  it('reaches near maxSpeed when accel is held', () => {
    const { kart, track, input } = spawnKart();
    input.hold('accel');
    // 1.8s is enough to approach max speed without driving far enough to hit a wall on the curving track.
    step(kart, input, track, 1 / 60, 60 * 1.8);

    expect(kart.speed).toBeGreaterThan(config.kart.maxSpeed * 0.7);
    expect(kart.speed).toBeLessThanOrEqual(config.kart.maxSpeed + 0.001);
  });

  it('decays toward zero when accel is released (drag)', () => {
    const { kart, track, input } = spawnKart();
    input.hold('accel');
    step(kart, input, track, 1 / 60, 120);
    const peak = kart.speed;
    expect(peak).toBeGreaterThan(15);

    input.release('accel');
    step(kart, input, track, 1 / 60, 60 * 5);
    expect(kart.speed).toBeLessThan(peak * 0.3);
  });

  it('brake while moving forward decelerates', () => {
    const { kart, track, input } = spawnKart();
    input.hold('accel');
    step(kart, input, track, 1 / 60, 120);
    const before = kart.speed;

    input.release('accel');
    input.hold('brake');
    step(kart, input, track, 1 / 60, 30);

    expect(kart.speed).toBeLessThan(before);
  });

  it('reverses below 0 when brake is held from a stop', () => {
    const { kart, track, input } = spawnKart();
    input.hold('brake');
    step(kart, input, track, 1 / 60, 120);

    expect(kart.speed).toBeLessThan(0);
    expect(kart.speed).toBeGreaterThanOrEqual(-config.kart.reverseMaxSpeed - 0.001);
  });
});

describe('Drift mini-turbo', () => {
  it('activates a boost on release if drift charge passed the threshold', () => {
    const { kart, track, input } = spawnKart();
    input.hold('accel');
    step(kart, input, track, 1 / 60, 120); // get up to speed
    expect(kart.speed).toBeGreaterThan(8);

    input.hold('left');
    input.hold('drift');
    const driftSeconds = config.drift.miniTurboThreshold / config.drift.chargeRate + 0.1;
    step(kart, input, track, 1 / 60, Math.ceil(driftSeconds * 60));
    expect(kart.driftActive).toBe(true);
    expect(kart.driftCharge).toBeGreaterThanOrEqual(config.drift.miniTurboThreshold);

    input.release('drift');
    step(kart, input, track, 1 / 60, 1);

    expect(kart.driftActive).toBe(false);
    expect(kart.boostTimer).toBeGreaterThan(0);
    expect(kart.boostMultiplier).toBeCloseTo(config.drift.miniTurboBoost, 5);
  });

  it('does NOT boost when drift was released before reaching threshold', () => {
    const { kart, track, input } = spawnKart();
    input.hold('accel');
    step(kart, input, track, 1 / 60, 120);

    input.hold('left');
    input.hold('drift');
    step(kart, input, track, 1 / 60, 6); // very short drift, well below threshold
    input.release('drift');
    step(kart, input, track, 1 / 60, 1);

    expect(kart.driftActive).toBe(false);
    expect(kart.boostTimer).toBe(0);
  });
});

describe('Spin recovery (banana hit simulation)', () => {
  it('counts down spinTimer and recovers control after the duration', () => {
    const { kart, track, input } = spawnKart();
    kart.hit('spin');
    expect(kart.spinTimer).toBeGreaterThan(0);

    const frames = Math.ceil(config.items.banana.spinDuration * 60) + 5;
    step(kart, input, track, 1 / 60, frames);

    expect(kart.spinTimer).toBe(0);
  });
});
