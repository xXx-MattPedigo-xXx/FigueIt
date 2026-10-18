import { useCallback, useEffect, useMemo, useState } from 'react';
import { PATTERNS, computeLayout, perimeter, signedArea, summarize } from './engine';
import type { Pt } from './engine';
import { DEFAULTS, hasShapeError, loadState, saveState, toNumber, validatePaver, validateShape } from './model';
import type { AppState } from './model';
import { useCompareCounts } from './useCompareCounts';
import { useLastValid } from './useLastValid';
import { PatternControls } from './ui/PatternControls';
import { PaverControls } from './ui/PaverControls';
import { Plotter } from './ui/Plotter';
import { CompareTable, Results } from './ui/Results';
import type { CompareRow } from './ui/Results';
import { ShapeControls } from './ui/ShapeControls';

export function App() {
  const [state, setState] = useState(loadState);
  const [resets, setResets] = useState(0); // bumped by Reset so "last valid shape" is forgotten too
  useEffect(() => saveState(state), [state]);
  const reset = useCallback(() => { setState(DEFAULTS); setResets((n) => n + 1); }, []);

  const change = useCallback((patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })), []);
  const addPoint = useCallback((p: Pt) => setState((s) => {
    const last = s.points[s.points.length - 1];
    if (s.closed || (last && last[0] === p[0] && last[1] === p[1])) return s;
    return { ...s, points: [...s.points, p] };
  }), []);
  const movePoint = useCallback((index: number, p: Pt) => setState((s) => {
    const old = s.points[index];
    if (!old || (old[0] === p[0] && old[1] === p[1])) return s; // snapped to the same spot: nothing to do
    return { ...s, points: s.points.map((q, i) => (i === index ? p : q)) };
  }), []);
  const closeShape = useCallback(() => change({ closed: true }), [change]);

  // ---- validate inputs (engine does all the geometry) ----
  const shapeResult = useMemo(
    () => validateShape(state),
    [state.shapeType, state.dims, state.points, state.closed],
  );
  const paverResult = useMemo(
    () => validatePaver(state),
    [state.paverLength, state.paverWidth, state.joint],
  );

  // While a field holds a mistake we keep showing the last valid shape/paver. Empty fields are not mistakes:
  // an unfinished shape is simply "no shape yet" (blank grid). A custom polygon has no "last valid" either.
  const lastShape = useLastValid(shapeResult.shape, resets);
  const shapeError = state.shapeType !== 'polygon' && hasShapeError(shapeResult);
  const shape = shapeError ? lastShape : shapeResult.shape;
  const paver = useLastValid(paverResult.paver);
  const stale = paverResult.paver === null || shapeError;

  const rotation = toNumber(state.rotation);
  const offset = useMemo<Pt>(() => [toNumber(state.offsetX), toNumber(state.offsetY)], [state.offsetX, state.offsetY]);
  const waste = Math.max(0, toNumber(state.waste));

  // ---- layout for the drawing and results: only recomputed when its inputs change ----
  const layout = useMemo(
    () => (shape && paver ? computeLayout(shape, paver, state.pattern, rotation, offset) : null),
    [shape, paver, state.pattern, rotation, offset],
  );
  const areaSqIn = useMemo(() => (shape ? signedArea(shape) : 0), [shape]);
  const summary = useMemo(
    () => (shape && paver && layout ? summarize(areaSqIn, perimeter(shape), paver, layout, waste) : null),
    [shape, paver, layout, areaSqIn, waste],
  );

  // ---- compare table: all four patterns, counted in the background (see useCompareCounts) ----
  // The pattern is not part of these inputs, so picking a pattern does not recompute the table.
  const compareInputs = useMemo(
    () => (shape && paver ? { shape, paver, rotation, offset } : null),
    [shape, paver, rotation, offset],
  );
  const compare = useCompareCounts(compareInputs);
  const compareRows = useMemo<CompareRow[]>(() => {
    if (!compare) return [];
    const area = signedArea(compare.inputs.shape);
    return compare.counts.map((c) => ({
      ...c,
      order: summarize(area, 0, compare.inputs.paver, { ...c, applicable: true, placements: [] }, waste).order,
    }));
  }, [compare, waste]);

  const patternLabel = PATTERNS.find((p) => p.id === state.pattern)!.label;
  const inapplicableNote = layout && !layout.applicable
    ? `${patternLabel} needs a paver whose length is a whole multiple of its width (such as 2:1). Pick another pattern or change the paver.`
    : null;
  let emptyNote = 'Draw or enter a shape to see results';
  if (hasShapeError(shapeResult)) {
    emptyNote = shapeResult.groupError ?? 'Enter valid dimensions to see results.';
  }

  return (
    <>
      <header className="app-header">
        <h1>FigueIt</h1>
        <span className="tagline">Paver layout calculator</span>
        <button type="button" onClick={reset}>Reset</button>
      </header>

      <main className="panes">
        <div className="pane-left">
          <Plotter
            shape={shape}
            layout={layout}
            editable={state.shapeType === 'polygon'}
            points={state.points}
            closed={state.closed}
            stale={stale && shape !== null}
            onAddPoint={addPoint}
            onMovePoint={movePoint}
            onClose={closeShape}
          />
        </div>

        <div className="pane-right">
          <ShapeControls state={state} result={shapeResult} onChange={change} />
          <PaverControls state={state} result={paverResult} onChange={change} />
          <PatternControls state={state} paver={paver} onChange={change} />
          <Results
            summary={summary}
            areaSqIn={areaSqIn}
            stale={stale && summary !== null}
            inapplicableNote={inapplicableNote}
            emptyNote={emptyNote}
          />
          {compareInputs && compareRows.length > 0 && (
            <CompareTable
              rows={compareRows}
              current={state.pattern}
              updating={compare?.inputs !== compareInputs}
              onSelect={(pattern) => change({ pattern })}
            />
          )}
        </div>
      </main>
    </>
  );
}
