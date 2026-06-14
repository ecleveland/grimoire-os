'use client';

import { useEffect, useRef } from 'react';
import {
  useMutation,
  useQuery,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from './api';

/**
 * Cache-key shape for every query in this layer: a 2-tuple of the literal
 * `'api'` head and the fully-qualified path. Defined once so the type sites and
 * the `invalidateApiPath` runtime guard can't drift.
 */
export type ApiQueryKey = readonly ['api', string];

/**
 * Stable query key for a fully-qualified API path. The path already carries its
 * query string (`/srd/monsters?page=2&q=orc`), so it uniquely identifies a
 * cache entry on its own — params don't need to be split out into the key.
 */
export function apiQueryKey(path: string): ApiQueryKey {
  return ['api', path];
}

/** Toast shown when a query fails — mirrors the old per-page catch + toast. */
type ErrorToast = string | { message: string; id?: string };

export interface UseApiQueryOptions<T> extends Omit<
  UseQueryOptions<T, Error, T, ApiQueryKey>,
  'queryKey' | 'queryFn'
> {
  /**
   * When set, an error toast is shown whenever the query enters a *new* error
   * state. v5 dropped `onError` from `useQuery`, so this is wired through an
   * effect; a ref on the failure timestamp ensures each distinct failure toasts
   * exactly once (re-render churn while the error persists doesn't re-fire, but
   * a later refetch that fails again does).
   */
  errorToast?: ErrorToast;
}

/**
 * Thin wrapper over `useQuery` for the `apiFetch` helper. The path doubles as
 * the cache key, so callers get cancellation, dedupe, caching, and
 * keep-previous-data pagination for free.
 */
export function useApiQuery<T>(
  path: string,
  options: UseApiQueryOptions<T> = {}
): UseQueryResult<T, Error> {
  const { errorToast, ...queryOptions } = options;

  const query = useQuery<T, Error, T, ApiQueryKey>({
    queryKey: apiQueryKey(path),
    queryFn: () => apiFetch<T>(path),
    ...queryOptions,
  });

  // Toast at most once per distinct failure. `errorUpdatedAt` is the
  // last-failure timestamp; tracking the one we've already toasted means an
  // object-form `errorToast` (recreated each render) can't spam the toast/log on
  // unrelated re-renders, while a genuinely new failure still fires.
  const { isError, error, errorUpdatedAt } = query;
  const lastToastedAt = useRef(0);
  useEffect(() => {
    if (!isError || !errorToast) return;
    if (errorUpdatedAt === lastToastedAt.current) return;
    lastToastedAt.current = errorUpdatedAt;
    console.error(`Failed to fetch ${path}:`, error);
    if (typeof errorToast === 'string') {
      toast.error(errorToast);
    } else {
      toast.error(errorToast.message, errorToast.id ? { id: errorToast.id } : undefined);
    }
  }, [isError, error, errorUpdatedAt, errorToast, path]);

  return query;
}

/**
 * Thin wrapper over `useMutation`. The caller supplies the `apiFetch` call as
 * `mutationFn`; `onSuccess`/`onError` etc. pass straight through so a write can
 * invalidate the relevant `useApiQuery` caches on completion.
 */
export function useApiMutation<TData = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> = {}
): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({ mutationFn, ...options });
}

/**
 * Invalidate every cached API query whose path starts with `prefix` — e.g.
 * `/srd/monsters?` to refetch all cached pages/filters of the monster list
 * after a mutation, regardless of which page/filters are currently active.
 *
 * Matching is a plain `startsWith`, so pass a prefix that ends at a token
 * boundary (`/srd/monsters?`, `/encounters?campaignId=${id}&`) to avoid
 * accidentally matching a sibling key (`campaignId=10` vs `campaignId=1`).
 */
export function invalidateApiPath(client: QueryClient, prefix: string): Promise<void> {
  return client.invalidateQueries({
    predicate: query => {
      const key = query.queryKey;
      return (
        Array.isArray(key) &&
        key[0] === 'api' &&
        typeof key[1] === 'string' &&
        key[1].startsWith(prefix)
      );
    },
  });
}
