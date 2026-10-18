import { useState } from 'react';

/**
 * Returns `value` while it is valid (non-null), otherwise the most recent valid value.
 * Used so the drawing and results keep showing the last good inputs while a field is being fixed.
 */
export function useLastValid<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) setLast(value); // React allows updating own state during render
  return value ?? last;
}
