import { PATTERNS, isApplicable } from '../engine';
import type { Paver, PatternId } from '../engine';
import type { AppState } from '../model';
import { Field } from './Field';

interface Props {
  state: AppState;
  /** The last valid paver, used to decide which patterns are available. */
  paver: Paver | null;
  /** The pattern being drawn, which is the selected one (it differs from state.pattern during a fallback). */
  drawn: PatternId;
  /** Explains why the drawn pattern differs from the chosen one, or null. */
  note: string | null;
  onChange: (patch: Partial<AppState>) => void;
}

export function PatternControls({ state, paver, drawn, note, onChange }: Props) {
  return (
    <fieldset className="card">
      <legend>Pattern</legend>
      <div className="patterns" role="radiogroup" aria-label="Pattern">
        {PATTERNS.map((p) => {
          const ok = !paver || isApplicable(p.id, paver);
          return (
            <label key={p.id} className={ok ? 'radio' : 'radio disabled'}>
              {/* onClick, not onChange: during a fallback the drawn pattern is already checked, and clicking it
                  must still make it the chosen one (a change event doesn't fire for an already-checked radio). */}
              <input
                type="radio"
                name="pattern"
                value={p.id}
                checked={drawn === p.id}
                disabled={!ok}
                onChange={() => {}}
                onClick={() => onChange({ pattern: p.id })}
              />
              <span>{p.label}</span>
              {!ok && <small className="muted">needs a 2:1 paver</small>}
            </label>
          );
        })}
      </div>
      {note && <p className="warning pattern-note">{note}</p>}

      <div className="row">
        <Field label="Rotation (degrees)" kind="number" value={state.rotation}
          onChange={(v) => onChange({ rotation: v })} />
        <div className="field">
          <span className="label">Quick angles</span>
          <div className="buttons">
            {[0, 45, 90].map((deg) => (
              <button key={deg} type="button" onClick={() => onChange({ rotation: String(deg) })}>{deg}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="row">
        <Field label="Offset x (in)" kind="number" value={state.offsetX}
          onChange={(v) => onChange({ offsetX: v })} />
        <Field label="Offset y (in)" kind="number" value={state.offsetY}
          onChange={(v) => onChange({ offsetY: v })} />
        <Field label="Waste %" kind="number" value={state.waste}
          onChange={(v) => onChange({ waste: v })} />
      </div>
    </fieldset>
  );
}
