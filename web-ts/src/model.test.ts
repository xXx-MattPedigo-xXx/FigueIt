import { describe, expect, it } from 'vitest';
import {
  DEFAULTS, SHAPE_FIELDS, drawnPattern, edgesCross, fallbackNote, hasShapeError, switchShapeType, validateShape,
} from './model';
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

describe('switchShapeType', () => {
  const apply = (state: AppState, type: AppState['shapeType']): AppState => ({ ...state, ...switchShapeType(state, type) });

  it('fills the example values when the new type has no values, so a shape appears', () => {
    for (const type of Object.keys(SHAPE_FIELDS) as DimShapeType[]) {
      const next = apply(DEFAULTS, type);
      expect(next.shapeType).toBe(type);
      for (const f of SHAPE_FIELDS[type]) expect(next.dims[f.key]).toBe(f.placeholder);
      const r = validateShape(next);
      expect(r.shape).not.toBeNull();
      expect(hasShapeError(r)).toBe(false);
    }
  });

  it('keeps a type the user already filled, and brings the rectangle back after a round trip', () => {
    const rect = apply({ ...DEFAULTS, dims: { ...DEFAULTS.dims, w: '20', h: '15' } }, 'rectangle');
    const tri = apply(rect, 'triangle');
    expect(tri.dims.a).toBe("12'"); // triangle was empty, so it got its example
    expect(tri.dims.w).toBe('20'); // rectangle text untouched
    const back = apply(tri, 'rectangle');
    expect(back.dims.w).toBe('20');
    expect(back.dims.h).toBe('15');
  });

  it('fills only the empty fields and keeps the ones that have a value', () => {
    const rect = apply(DEFAULTS, 'rectangle');
    expect(rect.dims.w).toBe("14'");
    const l = apply(rect, 'lshape');
    expect([l.dims.w, l.dims.h, l.dims.nw, l.dims.nh]).toEqual(["14'", "12'", "6'", "5'"]);
    expect(validateShape(l).shape).not.toBeNull();

    const typed = apply({ ...DEFAULTS, dims: { ...DEFAULTS.dims, w: '14', h: '12' } }, 'trapezoid');
    expect([typed.dims.b1, typed.dims.b2, typed.dims.h]).toEqual(["16'", "10'", '12']); // height kept
    expect(validateShape(typed).shape).not.toBeNull();

    const tri = switchShapeType({ ...DEFAULTS, dims: { ...DEFAULTS.dims, w: '14', h: '12' } }, 'triangle');
    expect(tri.dims).toEqual({ ...DEFAULTS.dims, w: '14', h: '12', a: "12'", b: "10'", c: "14'" });
    const partial = apply({ ...DEFAULTS, dims: { ...DEFAULTS.dims, a: '9' } }, 'triangle');
    expect([partial.dims.a, partial.dims.b, partial.dims.c]).toEqual(['9', "10'", "14'"]);
  });

  it('shows the normal field error, not a blank grid, when kept values clash with the examples', () => {
    const narrow = apply({ ...DEFAULTS, dims: { ...DEFAULTS.dims, w: '5', h: '12' } }, 'lshape'); // 5' wide, 6' notch
    const r = validateShape(narrow);
    expect(r.shape).toBeNull();
    expect(hasShapeError(r)).toBe(true);
  });

  it('chains blank -> rectangle -> L -> trapezoid -> triangle -> rectangle with a shape at every step', () => {
    let s: AppState = DEFAULTS;
    for (const type of ['rectangle', 'lshape', 'trapezoid', 'triangle', 'rectangle'] as const) {
      s = apply(s, type);
      expect(validateShape(s).shape).not.toBeNull();
    }
  });

  it('treats whitespace-only text as empty, and leaves the polygon points alone', () => {
    const blankish = { ...DEFAULTS, dims: { ...DEFAULTS.dims, a: '  ' } };
    expect(switchShapeType(blankish, 'triangle').dims?.a).toBe("12'");
    const poly = { ...DEFAULTS, points: [[0, 0], [10, 0], [10, 10]] as Pt[], closed: true, shapeType: 'rectangle' as const };
    expect(switchShapeType(poly, 'polygon')).toEqual({ shapeType: 'polygon' });
  });
});

describe('drawnPattern', () => {
  const brick = { length: 8, width: 4, joint: 0.125 };
  const six9 = { length: 9, width: 6, joint: 0.125 };
  const square = { length: 12, width: 12, joint: 0.125 };
  const ten4 = { length: 10, width: 4, joint: 0.125 };

  it('draws the chosen pattern when the paver suits it', () => {
    expect(drawnPattern('herringbone', brick)).toBe('herringbone');
    expect(drawnPattern('basketweave', brick)).toBe('basketweave');
    expect(drawnPattern('stack', brick)).toBe('stack');
  });

  it('falls back to running bond for a paver that does not suit herringbone or basketweave', () => {
    for (const paver of [six9, square, ten4]) {
      expect(drawnPattern('herringbone', paver)).toBe('running');
      expect(drawnPattern('basketweave', paver)).toBe('running');
    }
  });

  it('never changes stack or running bond, and keeps the chosen pattern when there is no valid paver', () => {
    for (const paver of [brick, six9, square, ten4]) {
      expect(drawnPattern('stack', paver)).toBe('stack');
      expect(drawnPattern('running', paver)).toBe('running');
    }
    expect(drawnPattern('herringbone', null)).toBe('herringbone');
  });

  it('switches back by itself when the paver fits again (it is a function of the chosen pattern)', () => {
    expect(drawnPattern('herringbone', six9)).toBe('running');
    expect(drawnPattern('herringbone', brick)).toBe('herringbone');
  });
});

describe('fallbackNote', () => {
  it('is null when the drawn pattern is the chosen one', () => {
    expect(fallbackNote('herringbone', 'herringbone')).toBeNull();
  });

  it('names the chosen pattern, the reason and the pattern used', () => {
    expect(fallbackNote('herringbone', 'running')).toBe(
      'Herringbone needs a 2:1 paver like 4x8, so this layout uses Running bond. It switches back when the paver fits.',
    );
    expect(fallbackNote('basketweave', 'running')).toContain('Basketweave needs a 2:1 paver');
  });
});
