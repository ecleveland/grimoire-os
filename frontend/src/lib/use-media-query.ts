'use client';

import { useEffect, useState } from 'react';

// Tracks a CSS media query. SSR and jsdom safe: it defaults to false and never
// throws when `matchMedia` is missing, so a caller falls back to its narrow
// layout.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}
