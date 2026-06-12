'use client';

import type { SrdMonster } from '@/lib/types';
import MonsterSearchResults from '@/components/MonsterSearchResults';

const LIMIT = 8;

interface Props {
  /** The unlinked combatant being linked, for the helper text. */
  combatantName: string;
  /** Picking a result links it; the parent persists and closes on success. */
  onSelect: (monster: SrdMonster) => void;
  onCancel: () => void;
  /** Disables the result rows while the parent is persisting. */
  submitting?: boolean;
}

/**
 * Compact monster picker for linking an existing combatant to its stat block
 * (VEG-328). Same search UI as the lookup panel (shared MonsterSearchResults),
 * but picking a result selects it directly — no stat-block detour — because
 * the goal is a fast reference-only link.
 */
export default function LinkMonsterDialog({
  combatantName,
  onSelect,
  onCancel,
  submitting = false,
}: Props) {
  return (
    <div data-testid="link-monster" className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Link <span className="font-medium text-gray-900 dark:text-white">{combatantName}</span> to a
        monster stat block. The row&apos;s name, HP, and AC stay as they are — linking only adds the
        stat-block and loot references.
      </p>

      <MonsterSearchResults
        limit={LIMIT}
        onPick={onSelect}
        pickDisabled={submitting}
        resultTestId="link-result"
      />

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
