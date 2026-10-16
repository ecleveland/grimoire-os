'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { NetworkMode, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { invalidateApiPath, useApiMutation } from '@/lib/query';

export interface OptimisticPatchOptions<TData, TVariables> {
  /** The query the write guards. Refetched after a 409 so the next write carries the new version. */
  path: string;
  /** Toast for a 409. Each caller keeps its own wording; specs and E2E assert it. */
  conflictMessage: string;
  /** Toast when the rejection carries no message. A function when the wording varies per call. */
  errorMessage: string | ((variables: TVariables) => string);
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Passed to the mutation. 'always' runs it while the browser reports offline. */
  networkMode?: NetworkMode;
}

/**
 * The single optimistic-lock write path. The caller builds the request and puts
 * `expectedVersion` in the body, because the character write is a PATCH on the
 * query path while the encounter also POSTs loot to a sibling path.
 *
 * On a 409 the hook refetches `path`, so the next write carries the new
 * version, and toasts `conflictMessage`. Any other failure toasts the error's
 * message, or `errorMessage` when there is none. The `useApiMutation` result
 * comes back unchanged so a caller picks `mutate` or `mutateAsync`.
 */
export function useOptimisticPatch<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: OptimisticPatchOptions<TData, TVariables>
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  const { path, conflictMessage, errorMessage, onSuccess, networkMode } = options;

  return useApiMutation<TData, TVariables>(mutationFn, {
    // Only when set, so an unset option keeps the client's default.
    ...(networkMode && { networkMode }),
    onSuccess: (data, variables) => onSuccess?.(data, variables),
    onError: (err, variables) => {
      // Log before toasting, so a failed write leaves a diagnostic trail for
      // self-hosters.
      console.error(`Failed to write ${path}:`, err);
      if (err instanceof ApiError && err.status === 409) {
        void invalidateApiPath(queryClient, path).catch(refetchErr =>
          console.error(`Failed to refetch ${path} after conflict:`, refetchErr)
        );
        toast.error(conflictMessage);
      } else {
        const fallback =
          typeof errorMessage === 'function' ? errorMessage(variables) : errorMessage;
        toast.error(err instanceof Error && err.message ? err.message : fallback);
      }
    },
  });
}
