'use client';

import { useEffect, useRef, useState } from 'react';

interface SearchBoxProps {
  /** Initial committed value (uncontrolled). */
  initialValue?: string;
  /** Called with the debounced value once the user stops typing. */
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
  /** Debounce delay in ms. Defaults to 300. */
  delay?: number;
  className?: string;
}

export default function SearchBox({
  initialValue = '',
  onDebouncedChange,
  placeholder = 'Search...',
  delay = 300,
  className,
}: SearchBoxProps) {
  const [draft, setDraft] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDebouncedChange(draft);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, delay, onDebouncedChange]);

  const baseClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      className={className ?? baseClass}
    />
  );
}
