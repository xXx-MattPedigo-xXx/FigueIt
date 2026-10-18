import { describe, expect, it } from 'vitest';
import { edgesCross } from './model';
import type { Pt } from './engine';

describe('edgesCross', () => {
  it('is false for a simple rectangle and an L-shape', () => {
    expect(edgesCross([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
    expect(edgesCross([[0, 0], [12, 0], [12, 6], [6, 6], [6, 12], [0, 12]])).toBe(false);
  });

  it('is true for a bow-tie', () => {
    expect(edgesCross([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
  });

  it('is true when a point is dragged onto a non-adjacent edge', () => {
    const pts: Pt[] = [[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]];
    expect(edgesCross(pts)).toBe(true);
  });
});
