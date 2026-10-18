import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { describe, expect, it } from 'vitest';
import { buildShape, computeLayout, generateCells, isApplicable, signedArea } from './index';
import type { Paver, PatternId, Pt, ShapeSpec } from './index';

/**
 * Straightforward reference: clips every cell with polygon-clipping (this is the engine as it was
 * before the fast paths were added). Returns the counts and the total clipped area.
 */
function referenceLayout(shape: Pt[], paver: Paver, pattern: PatternId, rotationDeg: number, offset: Pt) {
  if (!isApplicable(pattern, paver)) return { applicable: false, full: 0, cut: 0, area: 0 };
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const local = shape.map(([x, y]): Pt => {
    const dx = x - offset[0], dy = y - offset[1];
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of local) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const box = { minX, minY, maxX, maxY };
  const target: Polygon = [local.map((p) => [p[0], p[1]] as [number, number])];
  const half = paver.joint / 2;
  const multiArea = (mp: MultiPolygon) => {
    let t = 0;
    for (const poly of mp) {
      poly.forEach((ring, idx) => {
        const a = Math.abs(signedArea(ring.slice(0, -1) as Pt[]));
        t += idx === 0 ? a : -a;
      });
    }
    return t;
  };

  let full = 0, cut = 0, total = 0;
  for (const cell of generateCells(pattern, paver, box)) {
    const x0 = cell.x + half, y0 = cell.y + half;
    const x1 = cell.x + cell.w - half, y1 = cell.y + cell.h - half;
    if (x0 >= box.maxX || x1 <= box.minX || y0 >= box.maxY || y1 <= box.minY) continue;
    const rect: Polygon = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
    const rectArea = (x1 - x0) * (y1 - y0);
    const area = multiArea(polygonClipping.intersection(rect, target));
    const isFull = area >= rectArea * (1 - 1e-6);
    if (!isFull && area < 0.05) continue;
    if (isFull) full++; else cut++;
    total += isFull ? rectArea : area;
  }
  return { applicable: true, full, cut, area: total };
}

const patterns: PatternId[] = ['stack', 'running', 'herringbone', 'basketweave'];

const shapes: Record<string, ShapeSpec> = {
  rectangle: { type: 'rectangle', w: "17' 3", h: "11' 5" },
  triangle: { type: 'triangle', a: "14'", b: "16'", c: "12'" },
  lshape: { type: 'lshape', w: "20'", h: "15'", nw: "8'", nh: "6'" },
  trapezoid: { type: 'trapezoid', b1: "18'", b2: "10'", h: "9'" },
  // concave with three notches, not axis aligned
  'concave polygon': {
    type: 'polygon',
    points: [[0, 0], [200, 10], [210, 90], [150, 70], [140, 140], [90, 100], [60, 160], [10, 120]],
  },
};

describe('layout fast paths match a clip-every-cell reference', () => {
  const paver: Paver = { length: 8, width: 4, joint: 0.125 };
  for (const [name, spec] of Object.entries(shapes)) {
    const poly = buildShape(spec)!;
    for (const pattern of patterns) {
      for (const rotation of [0, 15, 45]) {
        for (const offset of [[0, 0], [3, 1.5]] as Pt[]) {
          it(`${name} / ${pattern} / ${rotation} deg / offset ${offset}`, () => {
            const ref = referenceLayout(poly, paver, pattern, rotation, offset);
            const got = computeLayout(poly, paver, pattern, rotation, offset);
            expect(got.applicable).toBe(ref.applicable);
            expect({ full: got.full, cut: got.cut }).toEqual({ full: ref.full, cut: ref.cut });
            expect(got.total).toBe(got.placements.length);

            let area = 0;
            for (const p of got.placements) {
              expect(p.rect).toHaveLength(4);
              for (const ring of p.clipped) {
                // counter-clockwise, no repeated closing point
                expect(signedArea(ring)).toBeGreaterThan(0);
                expect(ring[0]).not.toEqual(ring[ring.length - 1]);
                area += signedArea(ring);
              }
              if (p.full) expect(p.clipped).toEqual([p.rect]);
            }
            expect(Math.abs(area - ref.area)).toBeLessThanOrEqual(1e-6 * ref.area);
          });
        }
      }
    }
  }

  it('also matches with a clockwise input ring and a non-trivial joint', () => {
    const poly = buildShape(shapes.trapezoid)!.slice().reverse();
    const p2: Paver = { length: 12, width: 6, joint: 0.5 };
    for (const pattern of patterns) {
      const ref = referenceLayout(poly, p2, pattern, 15, [3, 1.5]);
      const got = computeLayout(poly, p2, pattern, 15, [3, 1.5]);
      expect({ full: got.full, cut: got.cut }).toEqual({ full: ref.full, cut: ref.cut });
    }
  });
});

/** Timings are logged, not asserted (set VITE_FIGUEIT_BENCH=1 to run). */
describe.skipIf(!import.meta.env.VITE_FIGUEIT_BENCH)('layout benchmark', () => {
  const paver: Paver = { length: 8, width: 4, joint: 0.125 };
  const rectOf = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]];
  const lOf = (w: number, h: number, nw: number, nh: number): Pt[] =>
    [[0, 0], [w, 0], [w, h - nh], [w - nw, h - nh], [w - nw, h], [0, h]];
  // about 3,000 and 4,300 pavers (33.5 sq in per cell)
  const cases: [string, Pt[]][] = [
    ['rect ~3000', rectOf(360, 276)],
    ['rect ~4300', rectOf(390, 350)],
    ['L ~3000', lOf(380, 280, 120, 100)],
    ['L ~4300', lOf(420, 380, 140, 110)],
  ];

  function time(fn: () => unknown, reps = 5): number {
    fn();
    const times: number[] = [];
    for (let i = 0; i < reps; i++) {
      const t = performance.now();
      fn();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  it('reference vs fast paths', () => {
    const rows: string[] = [];
    for (const [name, poly] of cases) {
      for (const rotation of [0, 15]) {
        for (const pattern of patterns) {
          const before = time(() => referenceLayout(poly, paver, pattern, rotation, [0, 0]));
          const after = time(() => computeLayout(poly, paver, pattern, rotation, [0, 0]));
          const n = computeLayout(poly, paver, pattern, rotation, [0, 0]).total;
          rows.push(
            `${name.padEnd(11)} rot ${String(rotation).padStart(2)} ${pattern.padEnd(11)} ` +
            `${String(n).padStart(5)} pavers  before ${before.toFixed(1).padStart(7)} ms  after ${after.toFixed(1).padStart(6)} ms`,
          );
        }
      }
    }
    console.log('\n' + rows.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
