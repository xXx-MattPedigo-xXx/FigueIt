import { memo, useMemo } from 'react';
import type { PointerEvent } from 'react';
import { formatLength } from '../engine';
import type { Layout, Pt } from '../engine';

// Drawing conventions: the engine works in inches with Y pointing up. SVG has Y pointing down,
// so every point is drawn at (x, -y). The viewBox is in inches too, so one SVG unit = one inch.

const SNAP = 6; // inches, for custom polygon points
const DEFAULT_CANVAS: Pt[] = [[0, 0], [240, 240]]; // the blank 20 x 20 ft grid shown when there is no shape yet

interface PlotterProps {
  /** The closed outline to draw, or null when there is none yet. */
  shape: Pt[] | null;
  layout: Layout | null;
  /** Custom polygon mode: clicking adds points and points can be dragged. */
  editable: boolean;
  points: Pt[];
  closed: boolean;
  stale: boolean;
  onAddPoint: (p: Pt) => void;
  onMovePoint: (index: number, p: Pt) => void;
  onClose: () => void;
}

export function Plotter(props: PlotterProps) {
  const { shape, layout, editable, points, closed, stale } = props;

  const view = useMemo(() => {
    const pts = [...(shape ?? []), ...(editable ? points : [])];
    return fitView(pts.length === 0 || editable ? [...pts, ...DEFAULT_CANVAS] : pts);
  }, [shape, editable, points]);

  let hint: string | null = null;
  if (!shape) {
    if (!editable) hint = 'Enter the dimensions to see the drawing';
    else if (points.length === 0) hint = 'Tap the grid to start your outline, or choose a shape type';
  }

  const grid = useMemo(() => gridPath(view), [view]);
  const fontSize = view.size * 0.03;
  const handleRadius = view.size * 0.012;

  // Pointer position -> shape inches, snapped. getScreenCTM() accounts for viewBox scaling, letterboxing and page scroll.
  const toInches = (svg: SVGSVGElement, e: PointerEvent): Pt => {
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return [snap(p.x), snap(-p.y)];
  };

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    if (editable && !closed) props.onAddPoint(toInches(e.currentTarget, e));
  };

  const onHandleDown = (e: PointerEvent<SVGGElement>, index: number) => {
    e.stopPropagation();
    if (!closed && index === 0 && points.length >= 3) {
      props.onClose();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId); // keeps the drag working when the finger leaves the dot
  };

  const onHandleMove = (e: PointerEvent<SVGGElement>, index: number) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    props.onMovePoint(index, toInches(e.currentTarget.ownerSVGElement!, e));
  };

  return (
    <div className="plotter">
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ aspectRatio: `${view.w} / ${view.h}` }}
        className={editable && !closed ? 'adding' : undefined}
        role="img"
        aria-label="Paver layout drawing"
        onPointerDown={onBackgroundDown}
      >
        <path d={grid} className="grid" />
        {shape && <path d={ringPath(shape)} className="shape-fill" />}
        {layout && <PaverLayer layout={layout} />}
        {shape && <path d={ringPath(shape)} className="outline" />}
        {/* the outline being drawn, or a closed outline that is not valid (for example crossing edges) */}
        {editable && !shape && points.length > 1 && (
          <path d={`M${points.map(svgPoint).join('L')}${closed ? 'Z' : ''}`} className="draft" />
        )}
        {shape && <EdgeLabels ring={shape} fontSize={fontSize} />}
        {editable &&
          points.map((p, i) => (
            <g
              key={i}
              className={`handle${i === 0 && !closed && points.length >= 3 ? ' first' : ''}`}
              onPointerDown={(e) => onHandleDown(e, i)}
              onPointerMove={(e) => onHandleMove(e, i)}
            >
              <circle cx={p[0]} cy={-p[1]} r={handleRadius * 3} className="hit" />
              <circle cx={p[0]} cy={-p[1]} r={handleRadius} className="dot" />
            </g>
          ))}
      </svg>
      {hint && <p className="plot-hint">{hint}</p>}
      {stale && <p className="plotter-note stale">Showing the last valid inputs. Fix the highlighted fields to update.</p>}
      <ul className="legend">
        <li><span className="swatch full" /> Full paver</li>
        <li><span className="swatch cut" /> Cut paver</li>
      </ul>
    </div>
  );
}

// ---------- pavers ----------

/** All pavers are drawn as just two <path> elements (full, cut) so ~3,000 pavers stay cheap for the DOM. */
const PaverLayer = memo(function PaverLayer({ layout }: { layout: Layout }) {
  const { full, cut } = useMemo(() => {
    let full = '';
    let cut = '';
    for (const p of layout.placements) {
      if (p.full) full += ringPath(p.rect);
      else for (const ring of p.clipped) cut += ringPath(ring);
    }
    return { full, cut };
  }, [layout]);

  return (
    <>
      <path d={full} className="paver full" />
      <path d={cut} className="paver cut" />
    </>
  );
});

// ---------- edge labels ----------

function EdgeLabels({ ring, fontSize }: { ring: Pt[]; fontSize: number }) {
  return (
    <>
      {ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;
        // The ring is counter-clockwise, so "outward" is to the right of the direction of travel.
        const out = fontSize * 1.1;
        const x = (a[0] + b[0]) / 2 + (dy / length) * out;
        const y = (a[1] + b[1]) / 2 - (dx / length) * out;
        return (
          <text key={i} x={x} y={-y} fontSize={fontSize} className="edge-label">
            {formatLength(length)}
          </text>
        );
      })}
    </>
  );
}

// ---------- geometry helpers ----------

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The larger of w and h, used to scale fonts and handles with the drawing. */
  size: number;
}

/** The SVG viewBox (already flipped) that fits the points with a margin. */
function fitView(pts: Pt[]): View {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const margin = Math.max(24, Math.max(maxX - minX, maxY - minY) * 0.12);
  const w = maxX - minX + margin * 2;
  const h = maxY - minY + margin * 2;
  return { x: minX - margin, y: -maxY - margin, w, h, size: Math.max(w, h) };
}

/** Faint grid lines every foot (every 10 feet for very large shapes). */
function gridPath(view: View): string {
  const step = view.size > 1200 ? 120 : 12;
  let d = '';
  for (let x = Math.ceil(view.x / step) * step; x <= view.x + view.w; x += step) {
    d += `M${x} ${view.y}V${view.y + view.h}`;
  }
  for (let y = Math.ceil(view.y / step) * step; y <= view.y + view.h; y += step) {
    d += `M${view.x} ${y}H${view.x + view.w}`;
  }
  return d;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const svgPoint = (p: Pt) => `${round2(p[0])} ${round2(-p[1])}`;
const ringPath = (ring: Pt[]) => `M${ring.map(svgPoint).join('L')}Z`;
const snap = (inches: number) => Math.round(inches / SNAP) * SNAP + 0; // + 0 turns -0 into 0
