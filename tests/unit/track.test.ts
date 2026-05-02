import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTrackHeadless } from '../../src/track.js';
import { makeKart } from '../helpers/stubs.js';

function makeTrack() {
  return buildTrackHeadless();
}

describe('Track.nearestSampleIndex', () => {
  it('returns sample 0 for the start position', () => {
    const track = makeTrack();
    const start = track.samples[0];
    const { index, distSq } = track.nearestSampleIndex(start);
    expect(index).toBe(0);
    expect(distSq).toBeLessThan(0.001);
  });

  it('finds the closest sample for a point near the middle of the track', () => {
    const track = makeTrack();
    const target = track.samples[120];
    const probe = target.clone().add(new THREE.Vector3(0.5, 0, 0.5));
    const { index } = track.nearestSampleIndex(probe);
    expect(Math.abs(index - 120)).toBeLessThanOrEqual(2);
  });
});

describe('Track.isOffTrack', () => {
  it('reports on-track for sample positions', () => {
    const track = makeTrack();
    expect(track.isOffTrack(track.samples[0])).toBe(false);
    expect(track.isOffTrack(track.samples[50])).toBe(false);
  });

  it('reports off-track for points far from the racing line', () => {
    const track = makeTrack();
    const sample = track.samples[60];
    const tangent = track.tangents[60];
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const wayOff = sample.clone().addScaledVector(normal, track.roadHalfWidth + 5);
    expect(track.isOffTrack(wayOff)).toBe(true);
  });
});

describe('Track.updateProgress', () => {
  it('increments lap count when sampleIndex wraps from end → start', () => {
    const track = makeTrack();
    const scene = new THREE.Scene();
    const kart = makeKart(scene, track.samples[track.samples.length - 5].clone());

    // First update — establishes baseline at the high-index sample.
    track.updateProgress(kart);
    expect(kart.lap).toBe(-1); // No wrap yet — just the initial assignment.
    const startLap = kart.lap;

    // Teleport to the start (low index). This is the wraparound case.
    kart.position.copy(track.samples[2]);
    track.updateProgress(kart);
    expect(kart.lap).toBe(startLap + 1);
  });

  it('does NOT increment lap when teleporting backward (high → high or low → low)', () => {
    const track = makeTrack();
    const scene = new THREE.Scene();
    const kart = makeKart(scene, track.samples[100].clone());

    track.updateProgress(kart);
    const lapBefore = kart.lap;

    kart.position.copy(track.samples[50]);
    track.updateProgress(kart);
    expect(kart.lap).toBe(lapBefore);
  });

  it('totalProgress reflects lap * sampleCount + sampleIndex', () => {
    const track = makeTrack();
    const scene = new THREE.Scene();
    const kart = makeKart(scene, track.samples[40].clone());
    track.updateProgress(kart);
    expect(kart.totalProgress).toBe((kart.lap ?? 0) * track.samples.length + kart.sampleIndex);
  });
});

describe('Track.getWaypoint', () => {
  it('returns the sample at index 0 when offset is 0', () => {
    const track = makeTrack();
    expect(track.getWaypoint(0)).toEqual(track.samples[0]);
  });

  it('handles negative and out-of-range indices via modulo', () => {
    const track = makeTrack();
    const total = track.samples.length;
    expect(track.getWaypoint(-1)).toEqual(track.samples[total - 1]);
    expect(track.getWaypoint(total + 5)).toEqual(track.samples[5]);
  });

  it('offsets perpendicular to the tangent', () => {
    const track = makeTrack();
    const base = track.getWaypoint(20);
    const offset = track.getWaypoint(20, 3);
    expect(offset.distanceTo(base)).toBeCloseTo(3, 5);
  });
});
