import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { generateCells, isApplicable } from './patterns';
import type { BBox, Paver, PatternId } from './patterns';
import { signedArea } from './shapes';
import type { Pt } from './shapes';

export interface Placement {
  /** The whole paver rectangle in shape space (four corners). */
  rect: Pt[];
  /** The part that lands inside the shape, in shape space (one ring per separate piece). */
  clipped: Pt[][];
  full: boolean;
}

export interface Layout {
  applicable: boolean;
  full: number;
  cut: number;
  total: number;
  placements: Placement[];
}

const FULL_TOLERANCE = 1e-6;
const MIN_PIECE_AREA = 0.05; // square inches
const SHRINK = 1e-9; // keeps edges lying along a cell border from counting as crossing it

function polygonBox(poly: Pt[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function multiArea(mp: MultiPolygon): number {
  let total = 0;
  for (const poly of mp) {
    poly.forEach((ring, idx) => {
      const a = Math.abs(signedArea(ring.slice(0, -1) as Pt[]));
      total += idx === 0 ? a : -a;
    });
  }
  return total;
}

/** True for a simple convex ring with at least one real turn (collinear vertices are tolerated). */
function isConvexRing(xs: Float64Array, ys: Float64Array): boolean {
  const n = xs.length;
  if (n < 3) return false;
  let sign = 0;
  let turning = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, k = (i + 2) % n;
    const ax = xs[j] - xs[i], ay = ys[j] - ys[i];
    const bx = xs[k] - xs[j], by = ys[k] - ys[j];
    const cross = ax * by - ay * bx;
    const scale = Math.abs(ax) + Math.abs(ay) + Math.abs(bx) + Math.abs(by);
    if (Math.abs(cross) <= 1e-12 * scale * scale) continue; // collinear vertex
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
    turning += Math.atan2(cross, ax * bx + ay * by);
  }
  // a star polygon turns the same way at every vertex but winds more than once
  return sign !== 0 && Math.abs(Math.abs(turning) - 2 * Math.PI) < 1e-6;
}

/** The target polygon in pattern space, as flat arrays for cheap cell classification and clipping. */
class Target {
  readonly n: number;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly bx: Float64Array; // edge i runs (ax,ay) -> (bx,by)
  readonly by: Float64Array;
  /** Counter-clockwise vertex arrays when the ring is convex, else null. */
  readonly convexX: Float64Array | null;
  readonly convexY: Float64Array | null;

  constructor(local: Pt[]) {
    const n = local.length;
    this.n = n;
    this.ax = new Float64Array(n);
    this.ay = new Float64Array(n);
    this.bx = new Float64Array(n);
    this.by = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const [x1, y1] = local[i];
      const [x2, y2] = local[(i + 1) % n];
      this.ax[i] = x1; this.ay[i] = y1;
      this.bx[i] = x2; this.by[i] = y2;
    }
    const xs = Float64Array.from(local, (p) => p[0]);
    const ys = Float64Array.from(local, (p) => p[1]);
    if (isConvexRing(xs, ys)) {
      if (signedArea(local) < 0) {
        xs.reverse();
        ys.reverse();
      }
      this.convexX = xs;
      this.convexY = ys;
    } else {
      this.convexX = null;
      this.convexY = null;
    }
  }

  /** 0 = cell wholly outside, 1 = wholly inside, 2 = a boundary edge passes through it. */
  classify(x0: number, y0: number, x1: number, y1: number): 0 | 1 | 2 {
    const lx = x0 + SHRINK, hx = x1 - SHRINK;
    const ly = y0 + SHRINK, hy = y1 - SHRINK;
    const { n, ax, ay, bx, by } = this;
    for (let i = 0; i < n; i++) {
      if (segmentTouchesBox(ax[i], ay[i], bx[i], by[i], lx, ly, hx, hy)) return 2;
    }
    // no edge enters the cell, so one point decides: even-odd test of the centre
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let inside = false;
    for (let i = 0; i < n; i++) {
      const y1e = ay[i], y2e = by[i];
      if ((y1e > cy) === (y2e > cy)) continue;
      const xAt = ax[i] + ((cy - y1e) / (y2e - y1e)) * (bx[i] - ax[i]);
      if (xAt > cx) inside = !inside;
    }
    return inside ? 1 : 0;
  }
}

/** Liang-Barsky: does the closed segment meet the closed box? */
function segmentTouchesBox(
  ax: number, ay: number, bx: number, by: number,
  lx: number, ly: number, hx: number, hy: number,
): boolean {
  if ((ax < lx && bx < lx) || (ax > hx && bx > hx) || (ay < ly && by < ly) || (ay > hy && by > hy)) return false;
  const dx = bx - ax, dy = by - ay;
  const t = [0, 1];
  return clipT(-dx, ax - lx, t) && clipT(dx, hx - ax, t) && clipT(-dy, ay - ly, t) && clipT(dy, hy - ay, t);
}

function clipT(p: number, q: number, t: number[]): boolean {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) {
    if (r > t[1]) return false;
    if (r > t[0]) t[0] = r;
  } else {
    if (r < t[0]) return false;
    if (r < t[1]) t[1] = r;
  }
  return true;
}

/** Sutherland-Hodgman clip of a convex CCW ring to an axis-aligned cell. Returns a flat [x0,y0,x1,y1,...] array. */
function clipConvex(xs: Float64Array, ys: Float64Array, x0: number, y0: number, x1: number, y1: number): number[] {
  let cur: number[] = [];
  for (let i = 0; i < xs.length; i++) cur.push(xs[i], ys[i]);
  let next: number[] = [];
  for (let edge = 0; edge < 4 && cur.length > 0; edge++) {
    next = [];
    const m = cur.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const px = cur[2 * i], py = cur[2 * i + 1];
      const qx = cur[2 * j], qy = cur[2 * j + 1];
      // positive when the point is on the inner side of the given cell edge
      let dp: number, dq: number;
      switch (edge) {
        case 0: dp = px - x0; dq = qx - x0; break;
        case 1: dp = x1 - px; dq = x1 - qx; break;
        case 2: dp = py - y0; dq = qy - y0; break;
        default: dp = y1 - py; dq = y1 - qy; break;
      }
      if (dp >= 0) next.push(px, py);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        next.push(px + t * (qx - px), py + t * (qy - py));
      }
    }
    cur = next;
  }
  return cur;
}

/** Shoelace area of a flat [x,y,...] ring, absolute value. */
function flatArea(f: number[]): number {
  const m = f.length / 2;
  let sum = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    sum += f[2 * i] * f[2 * j + 1] - f[2 * j] * f[2 * i + 1];
  }
  return Math.abs(sum / 2);
}

export function computeLayout(
  shape: Pt[],
  paver: Paver,
  pattern: PatternId,
  rotationDeg: number,
  offset: Pt,
): Layout {
  if (!isApplicable(pattern, paver)) {
    return { applicable: false, full: 0, cut: 0, total: 0, placements: [] };
  }

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const [ox, oy] = offset;

  const toShape = (x: number, y: number): Pt => [x * cos - y * sin + ox, x * sin + y * cos + oy];
  const rectRing = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
    toShape(x0, y0), toShape(x1, y0), toShape(x1, y1), toShape(x0, y1),
  ];

  const local = shape.map((p): Pt => {
    const dx = p[0] - ox;
    const dy = p[1] - oy;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  });
  const box = polygonBox(local);
  const target = new Target(local);
  // polygon-clipping is only built when a concave boundary cell needs it
  let clipTarget: Polygon | null = null;
  const half = paver.joint / 2;

  const placements: Placement[] = [];
  let full = 0;
  let cut = 0;

  for (const cell of generateCells(pattern, paver, box)) {
    const x0 = cell.x + half, y0 = cell.y + half;
    const x1 = cell.x + cell.w - half, y1 = cell.y + cell.h - half;
    // cheap reject against the shape's bounding box
    if (x0 >= box.maxX || x1 <= box.minX || y0 >= box.maxY || y1 <= box.minY) continue;

    const rectArea = (x1 - x0) * (y1 - y0);
    const relation = target.classify(x0, y0, x1, y1);
    if (relation === 0) continue;

    let isFull: boolean;
    let clipped: Pt[][];

    if (relation === 1) {
      isFull = true;
      clipped = [rectRing(x0, y0, x1, y1)];
    } else if (target.convexX !== null && target.convexY !== null) {
      // convex target: Sutherland-Hodgman gives the single exact piece without the general clipper
      const piece = clipConvex(target.convexX, target.convexY, x0, y0, x1, y1);
      const area = flatArea(piece);
      isFull = area >= rectArea * (1 - FULL_TOLERANCE);
      if (!isFull && area < MIN_PIECE_AREA) continue;
      if (isFull) {
        clipped = [rectRing(x0, y0, x1, y1)];
      } else {
        const ring: Pt[] = [];
        for (let i = 0; i < piece.length; i += 2) {
          const px = piece[i], py = piece[i + 1];
          const prev = ring.length > 0 ? ring[ring.length - 1] : null;
          const q = toShape(px, py);
          if (prev && Math.abs(prev[0] - q[0]) < 1e-12 && Math.abs(prev[1] - q[1]) < 1e-12) continue;
          ring.push(q);
        }
        const first = ring[0], last = ring[ring.length - 1];
        if (ring.length > 1 && Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12) ring.pop();
        clipped = [ring];
      }
    } else {
      clipTarget ??= [local.map((p) => [p[0], p[1]] as [number, number])];
      const rect: Polygon = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
      const result = polygonClipping.intersection(rect, clipTarget);
      const area = multiArea(result);
      isFull = area >= rectArea * (1 - FULL_TOLERANCE);
      if (!isFull && area < MIN_PIECE_AREA) continue;
      clipped = isFull
        ? [rectRing(x0, y0, x1, y1)]
        : result.map((poly) => poly[0].slice(0, -1).map((p) => toShape(p[0], p[1])));
    }

    if (isFull) full++; else cut++;
    placements.push({ rect: rectRing(x0, y0, x1, y1), clipped, full: isFull });
  }

  return { applicable: true, full, cut, total: full + cut, placements };
}

export interface Summary {
  areaSqFt: number;
  perimeterIn: number;
  minimum: number;
  full: number;
  cut: number;
  total: number;
  order: number;
}

export function summarize(
  areaSqIn: number,
  perimeterIn: number,
  paver: Paver,
  layout: Layout,
  wastePercent: number,
): Summary {
  return {
    areaSqFt: areaSqIn / 144,
    perimeterIn,
    minimum: Math.ceil(areaSqIn / (paver.length * paver.width) - 1e-9),
    full: layout.full,
    cut: layout.cut,
    total: layout.total,
    order: Math.ceil(layout.total * (1 + wastePercent / 100) - 1e-9),
  };
}
