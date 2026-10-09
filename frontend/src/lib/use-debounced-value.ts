'use client';

import { useEffect, useState } from 'react';

/**
 * `value`, held back until it has stopped changing for `delayMs`. A change
 * before the delay elapses restarts the timer, so a search box only commits
 * once the user pauses typing. Feed the result straight into a query key.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
