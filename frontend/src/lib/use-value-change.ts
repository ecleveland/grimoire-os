'use client';

import { useState } from 'react';

/**
 * Calls `onChange` during render when `value` differs from the last render's,
 * compared with Object.is. The caller sets its own state inside `onChange`,
 * which React allows during render for the component's own state. This is
 * the replacement for an effect that only synchronises state to a prop.
 */
export function useValueChange<T>(value: T, onChange: (next: T, prev: T) => void): void {
  const [prev, setPrev] = useState(value);
  if (!Object.is(value, prev)) {
    setPrev(value);
    onChange(value, prev);
  }
}
