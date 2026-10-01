import { useSyncExternalStore } from 'react';

// The query string never changes while /login or /register is mounted, so there
// is nothing to subscribe to. Reading window.location after hydration, rather
// than useSearchParams, keeps both pages statically prerendered.
const subscribe = () => () => {};
const getSnapshot = () => new URLSearchParams(window.location.search).get('next');
const getServerSnapshot = () => null;

/** The `next` query parameter, null on the server and until hydration. */
export function useNextParam(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
