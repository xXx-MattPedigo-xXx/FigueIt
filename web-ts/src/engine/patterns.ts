export type PatternId = 'stack' | 'running' | 'herringbone' | 'basketweave';

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'stack', label: 'Stack bond (grid)' },
  { id: 'running', label: 'Running bond' },
  { id: 'herringbone', label: 'Herringbone' },
  { id: 'basketweave', label: 'Basketweave' },
];

export interface Paver {
  length: number; // inches
  width: number; // inches
  joint: number; // inches
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function ratioK(paver: Paver): number {
  const lc = paver.length + paver.joint;
  const wc = paver.width + paver.joint;
  return Math.round(lc / wc);
}

/** Herringbone and basketweave only close up when the long side is a whole multiple (2x, 3x...) of the short. */
export function isApplicable(pattern: PatternId, paver: Paver): boolean {
  if (pattern === 'stack' || pattern === 'running') return true;
  const lc = paver.length + paver.joint;
  const wc = paver.width + paver.joint;
  const k = ratioK(paver);
  return k >= 2 && Math.abs(lc / wc - k) <= 0.03 * k;
}

function intersects(r: Rect, b: BBox): boolean {
  return r.x < b.maxX && r.x + r.w > b.minX && r.y < b.maxY && r.y + r.h > b.minY;
}

/** Cells of the pattern (pitch size, joints not yet removed) that touch the box, in pattern space. */
export function generateCells(pattern: PatternId, paver: Paver, box: BBox): Rect[] {
  const lc = paver.length + paver.joint;
  const wc = paver.width + paver.joint;
  const cells: Rect[] = [];
  const add = (x: number, y: number, w: number, h: number) => {
    const r = { x, y, w, h };
    if (intersects(r, box)) cells.push(r);
  };

  switch (pattern) {
    case 'stack': {
      for (let j = Math.floor(box.minY / wc) - 1; j <= Math.ceil(box.maxY / wc) + 1; j++) {
        for (let i = Math.floor(box.minX / lc) - 1; i <= Math.ceil(box.maxX / lc) + 1; i++) {
          add(i * lc, j * wc, lc, wc);
        }
      }
      break;
    }
    case 'running': {
      for (let j = Math.floor(box.minY / wc) - 1; j <= Math.ceil(box.maxY / wc) + 1; j++) {
        const shift = Math.abs(j % 2) === 1 ? lc / 2 : 0;
        for (let i = Math.floor((box.minX - shift) / lc) - 1; i <= Math.ceil((box.maxX - shift) / lc) + 1; i++) {
          add(i * lc + shift, j * wc, lc, wc);
        }
      }
      break;
    }
    case 'herringbone': {
      // lattice vectors u = (wc, wc), v = (-lc, lc); each lattice point holds one horizontal and one vertical stone
      const pad = lc + wc;
      const corners = [
        [box.minX - pad, box.minY - pad], [box.maxX + pad, box.minY - pad],
        [box.minX - pad, box.maxY + pad], [box.maxX + pad, box.maxY + pad],
      ];
      let mMin = Infinity, mMax = -Infinity, nMin = Infinity, nMax = -Infinity;
      for (const [px, py] of corners) {
        const m = (px + py) / (2 * wc);
        const n = (py - px) / (2 * lc);
        mMin = Math.min(mMin, m); mMax = Math.max(mMax, m);
        nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
      }
      for (let n = Math.floor(nMin); n <= Math.ceil(nMax); n++) {
        for (let m = Math.floor(mMin); m <= Math.ceil(mMax); m++) {
          const bx = m * wc - n * lc;
          const by = m * wc + n * lc;
          add(bx, by, lc, wc);
          add(bx + lc, by + wc - lc, wc, lc);
        }
      }
      break;
    }
    case 'basketweave': {
      const k = Math.max(1, ratioK(paver));
      const strip = lc / k;
      for (let j = Math.floor(box.minY / lc) - 1; j <= Math.ceil(box.maxY / lc) + 1; j++) {
        for (let i = Math.floor(box.minX / lc) - 1; i <= Math.ceil(box.maxX / lc) + 1; i++) {
          const horizontal = Math.abs((i + j) % 2) === 0;
          for (let s = 0; s < k; s++) {
            if (horizontal) add(i * lc, j * lc + s * strip, lc, strip);
            else add(i * lc + s * strip, j * lc, strip, lc);
          }
        }
      }
      break;
    }
  }
  return cells;
}
