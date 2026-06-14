'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Default query behaviour for the whole app.
 *
 * - `staleTime` of 60s: list/reference reads stay fresh across quick
 *   back-and-forth navigation instead of refetching on every mount. Mutations
 *   invalidate explicitly (see `invalidateApiPath`), so this only suppresses
 *   redundant refetches, never correctness-critical ones.
 * - `retry: 1`: one transient-failure retry. `apiFetch` already redirects to
 *   /login on a 401 it can't refresh, so auth failures don't get retried into a
 *   loop — this is for flaky network blips.
 * - `refetchOnWindowFocus: false`: a self-hosted DM tool doesn't need
 *   tab-focus refetch churn.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser session (and per server request in SSR), created
  // lazily so React's render isn't recreating it on every pass.
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
