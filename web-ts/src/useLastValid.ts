import { useState } from 'react';

/**
 * Returns `value` while it is valid (non-null), otherwise the most recent valid value.
 * Used so the drawing and results keep showing the last good inputs while a field is being fixed.
 * Changing `resetKey` forgets the remembered value (used by Reset, which returns to "no shape yet").
 */
export function useLastValid<T>(value: T | null, resetKey: unknown = 0): T | null {
  const [held, setHeld] = useState<{ value: T | null; key: unknown }>({ value, key: resetKey });
  let current = held;
  if (held.key !== resetKey) {
    current = { value, key: resetKey };
    setHeld(current); // React allows updating own state during render
  } else if (value !== null && value !== held.value) {
    current = { value, key: resetKey };
    setHeld(current);
  }
  return value ?? current.value;
}
