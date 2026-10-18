import { useId } from 'react';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 'text' for lengths like 12'6", 'number' for plain numbers. */
  kind?: 'text' | 'number';
  /** Red border without a message (the message is shown elsewhere). */
  invalid?: boolean;
  error?: string;
}

/** A labelled input with an optional red border and one-line error message. */
export function Field({ label, value, onChange, kind = 'text', invalid, error }: FieldProps) {
  const id = useId();
  const bad = invalid || !!error;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={kind}
        step={kind === 'number' ? 'any' : undefined}
        inputMode={kind === 'number' ? 'decimal' : 'text'}
        autoComplete="off"
        spellCheck={false}
        className={bad ? 'invalid' : undefined}
        aria-invalid={bad}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <small className="error">{error}</small>}
    </div>
  );
}
