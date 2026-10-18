import { PAVER_PRESETS } from '../model';
import type { AppState, PaverResult } from '../model';
import { Field } from './Field';

interface Props {
  state: AppState;
  result: PaverResult;
  onChange: (patch: Partial<AppState>) => void;
}

export function PaverControls({ state, result, onChange }: Props) {
  // Editing a size field switches the preset dropdown to Custom.
  const editSize = (patch: Partial<AppState>) => onChange({ ...patch, preset: 'custom' });

  const choosePreset = (id: string) => {
    const preset = PAVER_PRESETS.find((p) => p.id === id)!;
    if (id === 'custom') onChange({ preset: id });
    else onChange({ preset: id, paverLength: preset.length, paverWidth: preset.width });
  };

  return (
    <fieldset className="card">
      <legend>Paver</legend>
      <div className="field">
        <label htmlFor="preset">Preset</label>
        <select id="preset" value={state.preset} onChange={(e) => choosePreset(e.target.value)}>
          {PAVER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <Field label="Length" value={state.paverLength} error={result.errors.length}
          onChange={(v) => editSize({ paverLength: v })} />
        <Field label="Width" value={state.paverWidth} error={result.errors.width}
          onChange={(v) => editSize({ paverWidth: v })} />
        <Field label="Joint" value={state.joint} error={result.errors.joint}
          onChange={(v) => onChange({ joint: v })} />
      </div>
      <p className="hint">Inches by default: 8, 3/8 or 1 1/2.</p>
    </fieldset>
  );
}
