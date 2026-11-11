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

/** How often a campaign member's tracker refetches while combat is active. */
export const LIVE_POLL_MS = 3000;
/** How often it refetches while combat is not running. */
export const IDLE_POLL_MS = 10_000;

/** Who is looking at the tracker, which decides whether it polls. */
export interface EncounterViewer {
  userId: string | null;
  isDm: boolean;
}

/**
 * The tracker's control rule. `isDm` is the account role, not campaign
 * ownership, which is the rule the tracker's controls have always used.
 */
export function isController(encounter: Encounter, viewer: EncounterViewer): boolean {
  return viewer.isDm || (viewer.userId !== null && encounter.createdBy === viewer.userId);
}

// A controller's own writes land in the cache, so only the read-only view
// polls. It polls while combat is idle too, because a member who opens the
// tracker before the DM starts combat has no other way to learn it started.
// The idle cadence is slow rather than off.
const watchesLive = (encounter: Encounter | undefined | null, viewer: EncounterViewer) =>
  !!encounter && !isController(encounter, viewer);

const pollInterval = (encounter: Encounter | undefined, viewer: EncounterViewer) => {
  if (!encounter || !watchesLive(encounter, viewer)) return false;
  return encounter.isActive ? LIVE_POLL_MS : IDLE_POLL_MS;
};

export interface UseEncounterResult {
  encounter: Encounter | null;
  isLoading: boolean;
  isError: boolean;
  /** True while the tracker polls for other people's changes. */
  isLive: boolean;
  /** When the shown state arrived, 0 before the first load. */
  lastUpdatedAt: number;
  /** A refetch failed after data was shown, so the state on screen may be old. */
  refreshFailed: boolean;
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
 * GET; a 409 refetches through the shared optimistic-patch hook. A viewer who
 * cannot control the tracker polls it every LIVE_POLL_MS while combat is
 * active and every IDLE_POLL_MS otherwise, so they follow the DM's turns
 * without reloading.
 */
export function useEncounter(encounterId: string, viewer: EncounterViewer): UseEncounterResult {
  const queryClient = useQueryClient();
  const path = `/encounters/${encounterId}`;
  // In the live view a failed poll dims the indicator instead of toasting, so
  // a dropped connection does not toast every few seconds. The cache keeps the
  // last data through a failed refetch, so the first load still toasts. The
  // controller has no indicator, so its failures toast as before.
  const cached = queryClient.getQueryData<Encounter>(apiQueryKey(path));
  const suppressToast = watchesLive(cached, viewer);
  // The tracker is a live combat document that other pages also write, so
  // every mount refetches, as the page did before it read through the cache.
  const query = useApiQuery<Encounter>(path, {
    errorToast: suppressToast ? undefined : 'Failed to load encounter',
    staleTime: 0,
    refetchInterval: q => pollInterval(q.state.data, viewer),
    refetchIntervalInBackground: false,
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
    isLive: watchesLive(encounter, viewer),
    lastUpdatedAt: query.dataUpdatedAt,
    // failureCount covers a failure that is still retrying, before isError flips.
    refreshFailed: encounter !== null && (query.isError || query.failureCount > 0),
    writePending: pendingWrites > 0,
    patch,
    rollLoot,
  };
}
