'use client';

import type { SrdMonster } from '@/lib/types';
import { formatCr } from '@/lib/srd-format';
import { useMonsterSearch } from '@/lib/use-monster-search';

interface Props {
  /** Page size for the debounced `/srd/monsters` search. */
  limit: number;
  /** Called with the full list-result monster when a row is clicked. */
  onPick: (monster: SrdMonster) => void;
  /** Disables the result rows (e.g. while the parent is persisting). */
  pickDisabled?: boolean;
  /** data-testid for each result row — the two pickers assert distinct ids. */
  resultTestId: string;
}

/**
 * The shared monster-search UI: debounced input, prompt/searching/empty
 * states, compact result rows (name · size type · CR), and the showing-X-of-Y
 * footer. One component serves both the lookup panel (VEG-259) and the
 * link-monster picker (VEG-328) so the presentation can't drift — what a row
 * click does is the only thing the parents decide.
 */
export default function MonsterSearchResults({
  limit,
  onPick,
  pickDisabled = false,
  resultTestId,
}: Props) {
  const { searchInput, setSearchInput, query, results, total, loading } = useMonsterSearch(limit);

  return (
    <div className="space-y-3">
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
                  data-testid={resultTestId}
                  onClick={() => onPick(m)}
                  disabled={pickDisabled}
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
    </div>
  );
}
