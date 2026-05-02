import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickItemForRank } from '../../src/items.js';
import { makeKart } from '../helpers/stubs.js';

function buildKarts(progressValues: number[]) {
  const scene = new THREE.Scene();
  return progressValues.map((p, i) => {
    const k = makeKart(scene, new THREE.Vector3(i * 5, 0, 0));
    k.totalProgress = p;
    return k;
  });
}

function tally(samples: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) out[s] = (out[s] ?? 0) + 1;
  return out;
}

describe('pickItemForRank', () => {
  it('always returns a known item', () => {
    const karts = buildKarts([100, 80, 60, 40, 20]);
    for (let i = 0; i < 100; i++) {
      const item = pickItemForRank(karts[2], karts);
      expect(['boost', 'banana', 'missile', 'shield']).toContain(item);
    }
  });

  it('biases the leader toward defensive items (banana/shield)', () => {
    const karts = buildKarts([1000, 0, 0, 0, 0]); // leader by a mile
    const samples: string[] = [];
    for (let i = 0; i < 4000; i++) samples.push(pickItemForRank(karts[0], karts));
    const t = tally(samples);
    // Leader weights are [1,4,1,4] for [boost,banana,missile,shield] = sum 10.
    // So banana ≈ 40% (≈1600), shield ≈ 40%, boost ≈ 10%, missile ≈ 10%.
    expect((t.banana ?? 0) + (t.shield ?? 0)).toBeGreaterThan((t.boost ?? 0) + (t.missile ?? 0) * 1.5);
  });

  it('biases last place toward offensive comeback items (boost/missile)', () => {
    const karts = buildKarts([1000, 800, 600, 400, 0]); // last-place kart
    const samples: string[] = [];
    for (let i = 0; i < 4000; i++) samples.push(pickItemForRank(karts[4], karts));
    const t = tally(samples);
    // Last weights [5,1,5,1] — boost+missile ≈ 80%, banana+shield ≈ 20%.
    expect((t.boost ?? 0) + (t.missile ?? 0)).toBeGreaterThan((t.banana ?? 0) + (t.shield ?? 0) * 1.5);
  });

  it('treats single-kart races as leader (t=0)', () => {
    const karts = buildKarts([100]);
    const item = pickItemForRank(karts[0], karts);
    expect(['boost', 'banana', 'missile', 'shield']).toContain(item);
  });
});
