'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { invalidateApiPath, useApiMutation } from '@/lib/query';
import type { Character } from '@/lib/types';

/**
 * Stored character fields the in-sheet play controls (VEG-349) may write.
 * Deliberately a narrow allow-list — these controls mutate stored state only;
 * derived values (DC, attack bonus, modifiers) come from the computed-stats
 * layer and are never patched from here.
 */
export type CharacterPatch = Partial<
  Pick<
    Character,
    'hitPoints' | 'deathSaves' | 'hitDice' | 'heroicInspiration' | 'spellSlots' | 'currency'
  >
>;

export interface CharacterMutation {
  /** Fire-and-forget PATCH carrying the optimistic-lock `expectedVersion`. */
  patch: (fields: CharacterPatch) => void;
  /** True while a write is in flight — callers disable controls to serialize writes. */
  isSaving: boolean;
}

/**
 * Props an editable sheet section accepts. All optional so a section renders
 * read-only (its prior behavior) when omitted — only the owner-facing sheet
 * threads them in.
 */
export interface PlayControlProps {
  isOwner?: boolean;
  onPatch?: (fields: CharacterPatch) => void;
  isSaving?: boolean;
}

/**
 * Single write path for every quick-action on the sheet. One mutation instance
 * is shared across all controls so `isSaving` serializes writes: because each
 * control derives its next state from the current `character` prop (which only
 * updates after a successful write refetches the query), disabling while a write
 * is in flight prevents two clicks racing the same `expectedVersion`.
 */
export function useCharacterMutation(character: Character): CharacterMutation {
  const queryClient = useQueryClient();
  const path = `/characters/${character.id}`;

  const mutation = useApiMutation<Character, CharacterPatch>(
    fields =>
      apiFetch<Character>(path, {
        method: 'PATCH',
        body: JSON.stringify({ ...fields, expectedVersion: character.version }),
      }),
    {
      // The sheet reads this same `/characters/:id` query; refetch so the new
      // stored state and the bumped version flow back down before the next write.
      onSuccess: () => void invalidateApiPath(queryClient, path),
      onError: err => {
        if (err instanceof ApiError && err.status === 409) {
          // Concurrent edit (VEG-137 optimistic lock): pull the latest so the
          // next click carries the new version, and tell the player to retry.
          void invalidateApiPath(queryClient, path);
          toast.error(
            'This character was changed elsewhere. Reloaded the latest version — try again.'
          );
        } else {
          toast.error(err instanceof Error ? err.message : 'Failed to update character');
        }
      },
    }
  );

  return { patch: fields => mutation.mutate(fields), isSaving: mutation.isPending };
}
