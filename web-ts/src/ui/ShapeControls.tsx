import { SHAPE_FIELDS, SHAPE_TYPES } from '../model';
import type { AppState, DimShapeType, ShapeResult, ShapeType } from '../model';
import { Field } from './Field';

interface Props {
  state: AppState;
  result: ShapeResult;
  onChange: (patch: Partial<AppState>) => void;
}

export function ShapeControls({ state, result, onChange }: Props) {
  const { shapeType } = state;
  return (
    <fieldset className="card">
      <legend>Shape</legend>
      <div className="field">
        <label htmlFor="shape-type">Type</label>
        <select
          id="shape-type"
          value={shapeType}
          onChange={(e) => onChange({ shapeType: e.target.value as ShapeType })}
        >
          {SHAPE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {shapeType === 'polygon' ? (
        <PolygonControls state={state} result={result} onChange={onChange} />
      ) : (
        <>
          <div className="row">
            {SHAPE_FIELDS[shapeType as DimShapeType].map((f) => (
              <Field
                key={`${shapeType}-${f.key}`}
                label={f.label}
                placeholder={f.placeholder}
                value={state.dims[f.key]}
                error={result.fieldErrors[f.key]}
                invalid={!!result.groupError}
                onChange={(v) => onChange({ dims: { ...state.dims, [f.key]: v } })}
              />
            ))}
          </div>
          {result.groupError && <small className="error">{result.groupError}</small>}
          <p className="hint">Feet by default: 12, 12'6" or 12-6.</p>
        </>
      )}
    </fieldset>
  );
}

function PolygonControls({ state, result, onChange }: Props) {
  const count = state.points.length;
  return (
    <>
      <p className="hint">
        {state.closed
          ? 'Drag points to reshape. Points snap to a 6 inch grid.'
          : 'Click the drawing to add points (6 inch grid). Click the first point, or press Close shape, to finish.'}
      </p>
      <div className="buttons">
        <button type="button" disabled={state.closed || count < 3} onClick={() => onChange({ closed: true })}>
          Close shape
        </button>
        <button type="button" disabled={count === 0} onClick={() => onChange({ points: [], closed: false })}>
          Clear points
        </button>
        <span className="muted">{count} {count === 1 ? 'point' : 'points'}</span>
      </div>
      {count > 0 && count < 3 && <small className="error">A polygon needs at least 3 points.</small>}
      {result.groupError && <small className="error">{result.groupError}</small>}
    </>
  );
}
