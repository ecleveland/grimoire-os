'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

/**
 * Default query behaviour for the whole app.
 *
 * - `staleTime` of 60s: list/reference reads stay fresh across quick
 *   back-and-forth navigation instead of refetching on every mount. Mutations
 *   invalidate explicitly (see `invalidateApiPath`), so this only suppresses
 *   redundant refetches, never correctness-critical ones.
 * - `retry`: one retry, but only for network blips / 5xx. A deterministic 4xx
 *   (404 not-found, 403, 400, 409) won't change on retry, so it surfaces
 *   immediately instead of waiting out a pointless backoff. (`apiFetch` already
 *   redirects on an unrecoverable 401 before throwing, so that path is moot.)
 * - `refetchOnWindowFocus: false`: a self-hosted DM tool doesn't need
 *   tab-focus refetch churn.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.status < 500),
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
