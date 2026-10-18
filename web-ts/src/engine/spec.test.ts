import { describe, expect, it } from 'vitest';
import spec from '../../../shared/spec.json';
import {
  buildShape, computeLayout, generateCells, isApplicable, parseLength, perimeter, signedArea,
} from './index';
import type { PatternId, ShapeSpec, Unit, Paver } from './index';

describe('parseLength', () => {
  for (const c of spec.parse) {
    it(`${JSON.stringify(c.input)} (default ${c.defaultUnit})`, () => {
      const got = parseLength(c.input, c.defaultUnit as Unit);
      if (c.inches === null) expect(got).toBeNull();
      else expect(got).toBeCloseTo(c.inches, 6);
    });
  }
});

describe('shapes', () => {
  for (const c of spec.shapes) {
    it(c.name, () => {
      const poly = buildShape(c.shape as unknown as ShapeSpec);
      if ('invalid' in c && c.invalid) {
        expect(poly).toBeNull();
        return;
      }
      expect(poly).not.toBeNull();
      expect(signedArea(poly!) / 144).toBeCloseTo(c.areaSqFt!, 6);
      if (c.perimeterIn != null) expect(perimeter(poly!)).toBeCloseTo(c.perimeterIn, 6);
    });
  }
});

describe('layouts', () => {
  for (const c of spec.layouts) {
    it(c.name, () => {
      const poly = buildShape(c.shape as unknown as ShapeSpec)!;
      const layout = computeLayout(poly, c.paver, c.pattern as PatternId, c.rotation, c.offset as [number, number]);
      expect(layout.applicable).toBe(true);
      expect({ full: layout.full, cut: layout.cut }).toEqual({ full: c.full, cut: c.cut });
    });
  }
});

describe('applicability', () => {
  for (const c of spec.applicability) {
    it(`${c.paver.length}x${c.paver.width} g${c.paver.joint} ${c.pattern}`, () => {
      expect(isApplicable(c.pattern as PatternId, c.paver)).toBe(c.applicable);
    });
  }
});

describe('pattern tiling', () => {
  const paver: Paver = { length: 8, width: 4, joint: 0 };
  const patterns: PatternId[] = ['stack', 'running', 'herringbone', 'basketweave'];
  for (const pattern of patterns) {
    it(`${pattern}: cells never overlap and fill the box`, () => {
      const box = { minX: 0, minY: 0, maxX: 96, maxY: 96 };
      const cells = generateCells(pattern, paver, box);
      // clip to the box and add up areas: equal to the box area means no gaps and no overlaps
      let area = 0;
      for (const r of cells) {
        const w = Math.min(r.x + r.w, box.maxX) - Math.max(r.x, box.minX);
        const h = Math.min(r.y + r.h, box.maxY) - Math.max(r.y, box.minY);
        area += Math.max(0, w) * Math.max(0, h);
      }
      expect(area).toBeCloseTo(96 * 96, 6);
    });
  }

  it('herringbone also tiles for 3:1 pavers', () => {
    const box = { minX: 0, minY: 0, maxX: 120, maxY: 120 };
    const cells = generateCells('herringbone', { length: 12, width: 4, joint: 0 }, box);
    let area = 0;
    for (const r of cells) {
      const w = Math.min(r.x + r.w, box.maxX) - Math.max(r.x, box.minX);
      const h = Math.min(r.y + r.h, box.maxY) - Math.max(r.y, box.minY);
      area += Math.max(0, w) * Math.max(0, h);
    }
    expect(area).toBeCloseTo(120 * 120, 6);
  });
});

describe('rotation', () => {
  it('area is conserved: full + cut pieces cover the shape exactly', () => {
    const poly = buildShape({ type: 'lshape', w: "20'", h: "15'", nw: "8'", nh: "6'" })!;
    const paver: Paver = { length: 8, width: 4, joint: 0 };
    for (const pattern of ['stack', 'running', 'herringbone', 'basketweave'] as PatternId[]) {
      for (const rotation of [0, 15, 45]) {
        const layout = computeLayout(poly, paver, pattern, rotation, [0, 0]);
        let area = 0;
        for (const p of layout.placements) {
          for (const ring of p.clipped) area += Math.abs(signedArea(ring));
        }
        // slivers under 0.05 sq in are deliberately ignored, so allow a little shortfall but never an excess
        expect(area).toBeLessThanOrEqual(signedArea(poly) + 1e-3);
        expect(signedArea(poly) - area).toBeLessThan(0.5);
      }
    }
  });
});
