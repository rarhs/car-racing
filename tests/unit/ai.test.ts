import { describe, it, expect } from 'vitest';
import { wrapAngle } from '../../src/ai.js';

describe('wrapAngle', () => {
  it('leaves angles in [-π, π] unchanged', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(1)).toBe(1);
    expect(wrapAngle(-1)).toBe(-1);
    expect(wrapAngle(Math.PI - 0.001)).toBeCloseTo(Math.PI - 0.001);
    expect(wrapAngle(-Math.PI + 0.001)).toBeCloseTo(-Math.PI + 0.001);
  });

  it('wraps angles above π down by 2π', () => {
    expect(wrapAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
    expect(wrapAngle(2 * Math.PI + 0.3)).toBeCloseTo(0.3);
  });

  it('wraps angles below -π up by 2π', () => {
    expect(wrapAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
    expect(wrapAngle(-2 * Math.PI - 0.3)).toBeCloseTo(-0.3);
  });

  it('handles the typical AI use case (desired - current heading)', () => {
    // AI faces +π (south), wants to face -π+0.1 (just past south, wrapping). Should yield small +delta, not ~2π.
    const desired = -Math.PI + 0.1;
    const current = Math.PI;
    expect(wrapAngle(desired - current)).toBeCloseTo(0.1);
  });
});
