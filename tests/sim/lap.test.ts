import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Kart } from '../../src/kart.js';
import { AIController } from '../../src/ai.js';
import { buildTrackHeadless, type Track } from '../../src/track.js';
import type { ItemSystem } from '../../src/items.js';

function makeAIRunner(): { kart: Kart; ai: AIController; track: Track } {
  const track = buildTrackHeadless();
  const start = track.getStartPositions(1)[0];
  const scene = new THREE.Scene();
  const kart = new Kart({
    scene,
    model: new THREE.Group(),
    position: start.position,
    heading: start.heading,
    isPlayer: false,
    color: 0x00ff00,
  });
  const ai = new AIController(kart, track, 0);
  return { kart, ai, track };
}

describe('AI lap completion', () => {
  it('drives a kart at least one full lap in 90 simulated seconds', () => {
    const { kart, ai, track } = makeAIRunner();
    const dummyItems = {} as ItemSystem;
    const dt = 1 / 60;
    const maxFrames = 60 * 90;

    let lapsCompleted = 0;
    for (let i = 0; i < maxFrames; i++) {
      ai.update(dt, dummyItems, [kart]);
      kart.update(dt, ai.input, track);
      track.updateProgress(kart);
      if (kart.lap >= 1) { lapsCompleted = kart.lap; break; }
    }

    expect(lapsCompleted).toBeGreaterThanOrEqual(1);
  });

  it('keeps the kart on the road for the majority of the lap', () => {
    const { kart, ai, track } = makeAIRunner();
    const dummyItems = {} as ItemSystem;
    const dt = 1 / 60;
    const maxFrames = 60 * 90;

    let onRoadFrames = 0;
    let totalFrames = 0;
    for (let i = 0; i < maxFrames; i++) {
      ai.update(dt, dummyItems, [kart]);
      kart.update(dt, ai.input, track);
      track.updateProgress(kart);
      totalFrames++;
      if (!track.isOffTrack(kart.position)) onRoadFrames++;
      if (kart.lap >= 1) break;
    }

    const onRoadFraction = onRoadFrames / totalFrames;
    expect(onRoadFraction).toBeGreaterThan(0.7);
  });
});
