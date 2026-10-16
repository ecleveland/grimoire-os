'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { apiQueryKey, useApiQuery } from '@/lib/query';
import { useOptimisticPatch } from '@/lib/use-optimistic-patch';
import { clearDeathSavesIfRevived } from '@/lib/death-saves';
import type { Encounter } from '@/lib/types';
import type { EncounterLootTotal } from '@grimoire-os/shared';
import { toast } from 'sonner';

const CONFLICT_MESSAGE =
  'This encounter changed since you opened it — refreshed, please try again.';

// Enforce the death-save invariant at the one write chokepoint (VEG-288):
// any combatant being persisted above 0 HP must not carry death saves, so
// no current or future HP path can leave a revived PC showing stale pips.
const normalize = (updates: Partial<Encounter>): Partial<Encounter> =>
  updates.combatants
    ? { ...updates, combatants: updates.combatants.map(clearDeathSavesIfRevived) }
    : updates;

export interface UseEncounterResult {
  encounter: Encounter | null;
  isLoading: boolean;
  isError: boolean;
  writePending: boolean;
  patch: (
    updates: Partial<Encounter>,
    opts?: { errorMessage?: string }
  ) => Promise<Encounter | null>;
  rollLoot: (
    enc: Encounter,
    combatantIndex: number | undefined,
    successMsg: string
  ) => Promise<void>;
}

/**
 * The tracker's encounter read plus its two version-guarded writes. Writes put
 * the response straight into the query cache, so a write never costs a second
 * GET; a 409 refetches through the shared optimistic-patch hook.
 */
export function useEncounter(encounterId: string): UseEncounterResult {
  const queryClient = useQueryClient();
  const path = `/encounters/${encounterId}`;
  // The tracker is a live combat document that other pages also write, so
  // every mount refetches, as the page did before it read through the cache.
  const query = useApiQuery<Encounter>(path, {
    errorToast: 'Failed to load encounter',
    staleTime: 0,
  });
  const encounter = query.data ?? null;

  // Count of version-guarded writes (PATCHes and loot POSTs) in flight. A
  // counter, not a boolean: a quick write resolving mid-roll must not drop
  // the lock while the roll POST is still pending. While any write is
  // pending, the loot buttons disable and HP commits bail, so a single user
  // can't fire two writes against the same expectedVersion (the second
  // would always 409 and one write would be dropped).
  // A counter rather than the mutations' isPending: TanStack delivers mutation
  // state through notifyManager, which batches on setTimeout(0), so a second
  // click in the same tick would not see the first write. setState re-renders
  // synchronously.
  const [pendingWrites, setPendingWrites] = useState(0);

  const patchMutation = useOptimisticPatch<
    Encounter,
    { request: Promise<Encounter>; errorMessage: string }
  >(
    // The request starts in the click handler (see `patch`), and the mutation
    // only awaits it. TanStack awaits onMutate before it calls mutationFn, so
    // a request built here would leave a few microtasks after the click, and a
    // second click in the same tick would not be guarded by the write lock.
    v => v.request,
    {
      path,
      conflictMessage: CONFLICT_MESSAGE,
      errorMessage: v => v.errorMessage,
      // The request has already left, so the mutation must run at once and report the failure.
      networkMode: 'always',
      onSuccess: updated => queryClient.setQueryData(apiQueryKey(path), updated),
    }
  );

  const lootMutation = useOptimisticPatch<
    { encounter: Encounter; lootTotal: EncounterLootTotal },
    { request: Promise<{ encounter: Encounter; lootTotal: EncounterLootTotal }> }
  >(
    // Started in `rollLoot` for the same reason as the PATCH above.
    v => v.request,
    {
      path,
      conflictMessage: CONFLICT_MESSAGE,
      errorMessage: 'Failed to roll loot',
      // The request has already left, so the mutation must run at once and report the failure.
      networkMode: 'always',
      onSuccess: ({ encounter: updated }) => queryClient.setQueryData(apiQueryKey(path), updated),
    }
  );

  // Returns the updated encounter so callers can chain follow-up writes
  // (auto-roll on death) off the fresh version; null when the PATCH failed.
  const patch = async (
    updates: Partial<Encounter>,
    opts?: { errorMessage?: string }
  ): Promise<Encounter | null> => {
    if (!encounter) return null;
    // A write's response is the freshest state, so an in-flight background
    // refetch is cancelled rather than allowed to land on top of it. Not
    // awaited, so the request still leaves in the click's tick.
    void queryClient.cancelQueries({ queryKey: apiQueryKey(path) });
    setPendingWrites(n => n + 1);
    try {
      // All writes carry `expectedVersion` so concurrent edits surface as a 409
      // instead of silently clobbering each other (VEG-315, same guard as VEG-260/137).
      const request = apiFetch<Encounter>(path, {
        method: 'PATCH',
        body: JSON.stringify({ ...normalize(updates), expectedVersion: encounter.version }),
      });
      return await patchMutation.mutateAsync({
        request,
        errorMessage: opts?.errorMessage ?? 'Failed to update encounter',
      });
    } catch {
      return null;
    } finally {
      setPendingWrites(n => n - 1);
    }
  };

  // Roll loot via the VEG-300 endpoint: every monster combatant, or just
  // `combatantIndex` (an index into `enc.combatants`, NOT the sorted row).
  // `enc` is explicit rather than read from state so a caller chaining off a
  // fresh PATCH response can't race React's state update and guard on a stale
  // version.
  const rollLoot = async (
    enc: Encounter,
    combatantIndex: number | undefined,
    successMsg: string
  ): Promise<void> => {
    // Cancels a background refetch for the same reason as `patch`.
    void queryClient.cancelQueries({ queryKey: apiQueryKey(path) });
    setPendingWrites(n => n + 1);
    try {
      const request = apiFetch<{ encounter: Encounter; lootTotal: EncounterLootTotal }>(
        `${path}/loot`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(combatantIndex !== undefined && { combatantIndex }),
            expectedVersion: enc.version,
          }),
        }
      );
      await lootMutation.mutateAsync({ request });
      toast.success(successMsg);
    } catch {
      // useOptimisticPatch has already logged and toasted the failure.
    } finally {
      setPendingWrites(n => n - 1);
    }
  };

  return {
    encounter,
    isLoading: query.isPending,
    isError: query.isError,
    writePending: pendingWrites > 0,
    patch,
    rollLoot,
  };
}
