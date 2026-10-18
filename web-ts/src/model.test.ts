import { describe, expect, it } from 'vitest';
import { DEFAULTS, SHAPE_FIELDS, edgesCross, hasShapeError, validateShape } from './model';
import type { AppState, DimShapeType } from './model';
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

describe('empty shape fields', () => {
  const with_ = (patch: Partial<AppState>): AppState => ({ ...DEFAULTS, ...patch });

  it('start blank: a custom polygon with no points and no errors', () => {
    expect(DEFAULTS.shapeType).toBe('polygon');
    expect(DEFAULTS.points).toEqual([]);
    expect(Object.values(DEFAULTS.dims).every((v) => v === '')).toBe(true);
    const r = validateShape(DEFAULTS);
    expect(r).toEqual({ shape: null, fieldErrors: {}, groupError: null });
  });

  it('are not errors for any shape type', () => {
    for (const type of Object.keys(SHAPE_FIELDS) as DimShapeType[]) {
      const r = validateShape(with_({ shapeType: type }));
      expect(r.shape).toBeNull();
      expect(hasShapeError(r)).toBe(false);
    }
  });

  it('treat a partly filled shape as no shape yet, not an error', () => {
    const r = validateShape(with_({ shapeType: 'rectangle', dims: { ...DEFAULTS.dims, w: '14', h: '  ' } }));
    expect(r.shape).toBeNull();
    expect(hasShapeError(r)).toBe(false);
  });

  it('still report typed garbage and impossible shapes', () => {
    const bad = validateShape(with_({ shapeType: 'rectangle', dims: { ...DEFAULTS.dims, w: 'abc', h: '' } }));
    expect(bad.fieldErrors.w).toBeDefined();
    expect(bad.fieldErrors.h).toBeUndefined();
    const tri = validateShape(with_({ shapeType: 'triangle', dims: { ...DEFAULTS.dims, a: '1', b: '1', c: '10' } }));
    expect(tri.groupError).toBe("sides can't form a triangle");
  });

  it('still build a shape when every field is filled (the old default patio)', () => {
    const r = validateShape(with_({ shapeType: 'rectangle', dims: { ...DEFAULTS.dims, w: '14', h: '12' } }));
    expect(r.shape).not.toBeNull();
    expect(hasShapeError(r)).toBe(false);
  });
});
