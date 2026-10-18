import { parseLength } from './units';

export type Pt = [number, number];

export type ShapeSpec =
  | { type: 'rectangle'; w: string; h: string }
  | { type: 'triangle'; a: string; b: string; c: string }
  | { type: 'lshape'; w: string; h: string; nw: string; nh: string }
  | { type: 'trapezoid'; b1: string; b2: string; h: string }
  | { type: 'polygon'; points: Pt[] };

export function signedArea(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function perimeter(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

function len(text: string): number | null {
  const v = parseLength(text, 'ft');
  return v !== null && v > 0 ? v : null;
}

/** Builds a counter-clockwise polygon in inches, or null if the dimensions are missing or impossible. */
export function buildShape(spec: ShapeSpec): Pt[] | null {
  let poly: Pt[] | null = null;
  switch (spec.type) {
    case 'rectangle': {
      const w = len(spec.w), h = len(spec.h);
      if (w === null || h === null) return null;
      poly = [[0, 0], [w, 0], [w, h], [0, h]];
      break;
    }
    case 'triangle': {
      const a = len(spec.a), b = len(spec.b), c = len(spec.c);
      if (a === null || b === null || c === null) return null;
      if (a + b <= c || a + c <= b || b + c <= a) return null;
      const x = (b * b + c * c - a * a) / (2 * c);
      const y = Math.sqrt(Math.max(0, b * b - x * x));
      poly = [[0, 0], [c, 0], [x, y]];
      break;
    }
    case 'lshape': {
      const w = len(spec.w), h = len(spec.h), nw = len(spec.nw), nh = len(spec.nh);
      if (w === null || h === null || nw === null || nh === null) return null;
      if (nw >= w || nh >= h) return null;
      poly = [[0, 0], [w, 0], [w, h - nh], [w - nw, h - nh], [w - nw, h], [0, h]];
      break;
    }
    case 'trapezoid': {
      const b1 = len(spec.b1), b2 = len(spec.b2), h = len(spec.h);
      if (b1 === null || b2 === null || h === null) return null;
      poly = [[0, 0], [b1, 0], [(b1 + b2) / 2, h], [(b1 - b2) / 2, h]];
      break;
    }
    case 'polygon': {
      if (spec.points.length < 3) return null;
      poly = spec.points.map(([x, y]) => [x, y] as Pt);
      break;
    }
  }
  if (Math.abs(signedArea(poly)) < 1e-9) return null;
  if (signedArea(poly) < 0) poly.reverse();
  return poly;
}
