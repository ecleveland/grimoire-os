'use client';

import type { SrdMonster } from '@/lib/types';
import { formatCr } from '@/lib/srd-format';
import { useMonsterSearch } from '@/lib/use-monster-search';

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
 * (VEG-328). Same debounced search and result shape as the lookup panel, but
 * picking a result selects it directly — no stat-block detour — because the
 * goal is a fast reference-only link.
 */
export default function LinkMonsterDialog({
  combatantName,
  onSelect,
  onCancel,
  submitting = false,
}: Props) {
  const { searchInput, setSearchInput, query, results, total, loading } = useMonsterSearch(LIMIT);

  return (
    <div data-testid="link-monster" className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Link <span className="font-medium text-gray-900 dark:text-white">{combatantName}</span> to a
        monster stat block. The row&apos;s name, HP, and AC stay as they are — linking only adds the
        stat-block and loot references.
      </p>

      <input
        type="text"
        placeholder="Search monsters..."
        aria-label="Search monsters"
        value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />

      {!query ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Type to search the monster compendium.
        </p>
      ) : loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Searching…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No monsters found for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {results.map(m => (
              <li key={m.id}>
                <button
                  type="button"
                  data-testid="link-result"
                  onClick={() => onSelect(m)}
                  disabled={submitting}
                  className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900 dark:text-white">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {m.size} {m.type}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    CR {formatCr(m.challengeRating)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > results.length && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Showing {results.length} of {total}. Refine your search to narrow results.
            </p>
          )}
        </>
      )}

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
