// App state, defaults, persistence and input validation. No React in here.
import { PATTERNS, buildShape, isApplicable, parseLength } from './engine';
import type { Paver, PatternId, Pt, ShapeSpec } from './engine';

export type ShapeType = 'rectangle' | 'triangle' | 'lshape' | 'trapezoid' | 'polygon';

export const SHAPE_TYPES: { id: ShapeType; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'triangle', label: 'Triangle (three sides)' },
  { id: 'lshape', label: 'L-shape' },
  { id: 'trapezoid', label: 'Trapezoid' },
  { id: 'polygon', label: 'Custom polygon' },
];

export type DimShapeType = Exclude<ShapeType, 'polygon'>;

/** The text fields each shape type shows. Keys index into AppState.dims. The placeholder is an example value. */
export const SHAPE_FIELDS: Record<DimShapeType, { key: string; label: string; placeholder: string }[]> = {
  rectangle: [
    { key: 'w', label: 'Width', placeholder: "14'" },
    { key: 'h', label: 'Height', placeholder: "12'" },
  ],
  triangle: [
    { key: 'a', label: 'Side a', placeholder: "12'" },
    { key: 'b', label: 'Side b', placeholder: "10'" },
    { key: 'c', label: 'Side c', placeholder: "14'" },
  ],
  lshape: [
    { key: 'w', label: 'Width', placeholder: "14'" },
    { key: 'h', label: 'Height', placeholder: "12'" },
    { key: 'nw', label: 'Notch width', placeholder: "6'" },
    { key: 'nh', label: 'Notch height', placeholder: "5'" },
  ],
  trapezoid: [
    { key: 'b1', label: 'Bottom', placeholder: "16'" },
    { key: 'b2', label: 'Top', placeholder: "10'" },
    { key: 'h', label: 'Height', placeholder: "10'" },
  ],
};

export const PAVER_PRESETS: { id: string; label: string; length: string; width: string }[] = [
  { id: '4x8', label: '4x8 brick', length: '8', width: '4' },
  { id: '6x9', label: '6x9', length: '9', width: '6' },
  { id: '6x6', label: '6x6', length: '6', width: '6' },
  { id: '12x12', label: '12x12', length: '12', width: '12' },
  { id: '16x16', label: '16x16', length: '16', width: '16' },
  { id: '24x24', label: '24x24', length: '24', width: '24' },
  { id: 'custom', label: 'Custom', length: '', width: '' },
];

export interface AppState {
  shapeType: ShapeType;
  /** Text typed into the shape fields (feet by default), shared across shape types by key. */
  dims: Record<string, string>;
  /** Custom polygon points in inches, and whether the polygon has been closed. */
  points: Pt[];
  closed: boolean;
  /** Paver text fields (inches by default). */
  paverLength: string;
  paverWidth: string;
  joint: string;
  preset: string;
  /** The pattern the user chose. What is drawn may differ (see drawnPattern). */
  pattern: PatternId;
  rotation: string;
  offsetX: string;
  offsetY: string;
  waste: string;
}

/** First run and after Reset: a blank grid (custom polygon, no points) with every shape field empty. */
export const DEFAULTS: AppState = {
  shapeType: 'polygon',
  dims: { w: '', h: '', a: '', b: '', c: '', nw: '', nh: '', b1: '', b2: '' },
  points: [],
  closed: false,
  paverLength: '8',
  paverWidth: '4',
  joint: '1/8',
  preset: '4x8',
  pattern: 'herringbone',
  rotation: '0',
  offsetX: '0',
  offsetY: '0',
  waste: '10',
};

// ---------- persistence ----------

const STORAGE_KEY = 'figueit.react.v1';

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function isPoint(v: unknown): v is Pt {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Turns whatever came out of localStorage into a safe AppState, falling back to defaults field by field. */
function sanitize(raw: unknown): AppState {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const dims = { ...DEFAULTS.dims };
  if (typeof s.dims === 'object' && s.dims !== null) {
    for (const [k, v] of Object.entries(s.dims)) if (k in dims && typeof v === 'string') dims[k] = v;
  }
  const shapeType = SHAPE_TYPES.some((t) => t.id === s.shapeType) ? (s.shapeType as ShapeType) : DEFAULTS.shapeType;
  const pattern = PATTERNS.some((p) => p.id === s.pattern) ? (s.pattern as PatternId) : DEFAULTS.pattern;
  const points = Array.isArray(s.points) ? s.points.filter(isPoint) : [];
  return {
    shapeType,
    dims,
    points,
    closed: s.closed === true && points.length >= 3,
    paverLength: text(s.paverLength, DEFAULTS.paverLength),
    paverWidth: text(s.paverWidth, DEFAULTS.paverWidth),
    joint: text(s.joint, DEFAULTS.joint),
    preset: PAVER_PRESETS.some((p) => p.id === s.preset) ? (s.preset as string) : DEFAULTS.preset,
    pattern,
    rotation: text(s.rotation, DEFAULTS.rotation),
    offsetX: text(s.offsetX, DEFAULTS.offsetX),
    offsetY: text(s.offsetY, DEFAULTS.offsetY),
    waste: text(s.waste, DEFAULTS.waste),
  };
}

export function loadState(): AppState {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? sanitize(JSON.parse(json)) : DEFAULTS;
  } catch {
    return DEFAULTS; // storage blocked or corrupt JSON
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: the app still works, it just won't remember
  }
}

// ---------- validation ----------

export interface ShapeResult {
  /** The counter-clockwise polygon in inches, or null while the inputs are invalid or incomplete. */
  shape: Pt[] | null;
  /** Per-field messages (keyed like AppState.dims). */
  fieldErrors: Record<string, string>;
  /** A message about the fields as a group, e.g. "sides can't form a triangle". */
  groupError: string | null;
}

/** True when the shape inputs hold a real mistake (as opposed to just being empty or incomplete). */
export function hasShapeError(r: ShapeResult): boolean {
  return r.groupError !== null || Object.keys(r.fieldErrors).length > 0;
}

const BAD_LENGTH = `Enter a length like 12, 12'6" or 12-6`;

function toShapeSpec(state: AppState, type: DimShapeType): ShapeSpec {
  const d = state.dims;
  switch (type) {
    case 'rectangle': return { type, w: d.w, h: d.h };
    case 'triangle': return { type, a: d.a, b: d.b, c: d.c };
    case 'lshape': return { type, w: d.w, h: d.h, nw: d.nw, nh: d.nh };
    case 'trapezoid': return { type, b1: d.b1, b2: d.b2, h: d.h };
  }
}

const GROUP_ERRORS: Record<DimShapeType, string> = {
  rectangle: "that isn't a valid rectangle",
  triangle: "sides can't form a triangle",
  lshape: 'the notch must be smaller than the whole shape',
  trapezoid: "that isn't a valid trapezoid",
};

/** Which side of the line a->b the point c is on: positive left, negative right, 0 on the line. */
function side(a: Pt, b: Pt, c: Pt): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function onSegment(a: Pt, b: Pt, c: Pt): boolean {
  return c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0])
    && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
}

/** True when segment p1-p2 touches or crosses segment p3-p4. */
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = side(p3, p4, p1), d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3), d4 = side(p1, p2, p4);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return (d1 === 0 && onSegment(p3, p4, p1)) || (d2 === 0 && onSegment(p3, p4, p2))
    || (d3 === 0 && onSegment(p1, p2, p3)) || (d4 === 0 && onSegment(p1, p2, p4));
}

/** True when any two non-adjacent edges of the closed outline touch or cross. */
export function edgesCross(points: Pt[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // these two edges share the first point
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function validateShape(state: AppState): ShapeResult {
  if (state.shapeType === 'polygon') {
    if (!state.closed || state.points.length < 3) return { shape: null, fieldErrors: {}, groupError: null };
    if (edgesCross(state.points)) {
      return { shape: null, fieldErrors: {}, groupError: 'edges cross - move a point' };
    }
    const shape = buildShape({ type: 'polygon', points: state.points });
    return { shape, fieldErrors: {}, groupError: shape ? null : 'those points enclose no area' };
  }

  const type = state.shapeType;
  const fieldErrors: Record<string, string> = {};
  let incomplete = false;
  for (const field of SHAPE_FIELDS[type]) {
    const value = state.dims[field.key] ?? '';
    if (value.trim() === '') { incomplete = true; continue; } // empty means "not entered yet", not an error
    const inches = parseLength(value, 'ft');
    if (inches === null) fieldErrors[field.key] = BAD_LENGTH;
    else if (inches <= 0) fieldErrors[field.key] = 'Must be more than zero';
  }
  if (Object.keys(fieldErrors).length > 0 || incomplete) return { shape: null, fieldErrors, groupError: null };

  const shape = buildShape(toShapeSpec(state, type));
  return { shape, fieldErrors, groupError: shape ? null : GROUP_ERRORS[type] };
}

// ---------- shape type switching ----------

/**
 * The state change for picking a shape type in the selector. Each EMPTY field of the new type is filled with
 * its example value (the placeholder) and any field that already has text keeps it, so a shape appears straight
 * away (or the normal field error does, if the kept values and the examples clash). Dim keys are shared between
 * types (w/h by rectangle and L-shape, h by trapezoid), which is what lets a Rectangle 14' x 12' become an
 * L-shape 14' x 12' with a 6' x 5' notch. Only the new type's own keys are touched. Custom polygon keeps its points.
 */
export function switchShapeType(state: AppState, type: ShapeType): Partial<AppState> {
  if (type === 'polygon') return { shapeType: type };
  const dims = { ...state.dims };
  for (const f of SHAPE_FIELDS[type]) if ((dims[f.key] ?? '').trim() === '') dims[f.key] = f.placeholder;
  return { shapeType: type, dims };
}

// ---------- chosen vs drawn pattern ----------

/**
 * The pattern that is actually drawn. The user's chosen pattern, unless it cannot be laid with the paver
 * (herringbone and basketweave need a ~2:1 paver), in which case Running bond (always applicable).
 * With no valid paver there is nothing to be inapplicable to, so the chosen pattern stands.
 */
export function drawnPattern(chosen: PatternId, paver: Paver | null): PatternId {
  return paver && !isApplicable(chosen, paver) ? 'running' : chosen;
}

/** The note shown while the drawn pattern differs from the chosen one, or null when they match. */
export function fallbackNote(chosen: PatternId, drawn: PatternId): string | null {
  if (chosen === drawn) return null;
  const name = PATTERNS.find((p) => p.id === chosen)!.label;
  const used = PATTERNS.find((p) => p.id === drawn)!.label;
  return `${name} needs a 2:1 paver like 4x8, so this layout uses ${used}. It switches back when the paver fits.`;
}

export interface PaverResult {
  paver: Paver | null;
  errors: { length?: string; width?: string; joint?: string };
}

export function validatePaver(state: AppState): PaverResult {
  const length = parseLength(state.paverLength, 'in');
  const width = parseLength(state.paverWidth, 'in');
  const joint = parseLength(state.joint, 'in');
  const errors: PaverResult['errors'] = {};
  if (length === null || length <= 0) errors.length = length === null ? BAD_LENGTH : 'Must be more than zero';
  if (width === null || width <= 0) errors.width = width === null ? BAD_LENGTH : 'Must be more than zero';
  if (joint === null) errors.joint = BAD_LENGTH;
  if (length === null || width === null || joint === null || errors.length || errors.width) {
    return { paver: null, errors };
  }
  return { paver: { length, width, joint }, errors };
}

/** Reads a number field. Empty or unreadable text counts as 0. */
export function toNumber(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
