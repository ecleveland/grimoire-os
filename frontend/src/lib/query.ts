'use client';

import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from './api';

/**
 * Stable query key for a fully-qualified API path. The path already carries its
 * query string (`/srd/monsters?page=2&q=orc`), so it uniquely identifies a
 * cache entry on its own — params don't need to be split out into the key.
 */
export function apiQueryKey(path: string): readonly ['api', string] {
  return ['api', path];
}

/** Toast shown when a query fails — mirrors the old per-page catch + toast. */
type ErrorToast = string | { message: string; id?: string };

export interface UseApiQueryOptions<T> extends Omit<
  UseQueryOptions<T, Error, T, readonly ['api', string]>,
  'queryKey' | 'queryFn'
> {
  /**
   * When set, an error toast is shown whenever the query transitions into an
   * error state. v5 dropped `onError` from `useQuery`, so this is wired through
   * an effect keyed on the failure timestamp (re-toasts on each distinct
   * failure, not just the first).
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

  const query = useQuery<T, Error, T, readonly ['api', string]>({
    queryKey: apiQueryKey(path),
    queryFn: () => apiFetch<T>(path),
    ...queryOptions,
  });

  const { isError, error, errorUpdatedAt } = query;
  useEffect(() => {
    if (!isError || !errorToast) return;
    console.error(`Failed to fetch ${path}:`, error);
    if (typeof errorToast === 'string') {
      toast.error(errorToast);
    } else {
      toast.error(errorToast.message, errorToast.id ? { id: errorToast.id } : undefined);
    }
    // `errorUpdatedAt` advances on every failure, so a refetch that fails again
    // re-fires the toast instead of staying silent.
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
 */
export function invalidateApiPath(client: QueryClient, prefix: string): Promise<void> {
  return client.invalidateQueries({
    predicate: query => {
      const key = query.queryKey as QueryKey;
      return (
        Array.isArray(key) &&
        key[0] === 'api' &&
        typeof key[1] === 'string' &&
        key[1].startsWith(prefix)
      );
    },
  });
}
