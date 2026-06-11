'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { LootTemplateItemEntry, PaginatedResponse, SrdItem } from '@grimoire-os/shared';
import RangeInputPair from '@/components/RangeInputPair';

const LIMIT = 8;

const numberInputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: LootTemplateItemEntry[];
  onChange: (next: LootTemplateItemEntry[]) => void;
}

// Draft-while-focused weight input: clearing the field never commits a
// destructive 0; blur restores the committed value. Weights are clamped to
// ≥ 0 and may be fractional (the engine's weightedPick takes any ratio).
function WeightInput({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number;
  ariaLabel: string;
  onCommit: (weight: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={e => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') return;
        const n = Number(raw);
        if (Number.isFinite(n)) onCommit(Math.max(0, n));
      }}
      onBlur={() => setDraft(null)}
      className={numberInputClass}
    />
  );
}

/**
 * Structured editor for a loot template's weighted item entries (VEG-303).
 * New entries are picked from the items catalog via a debounced
 * `/srd/items` search — generation resolves entries to catalog ids by exact
 * `Item.name`, so free-typed names would silently produce id-less loot.
 */
export default function LootItemsEditor({ value, onChange }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the raw input into the query that drives the fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Stale guard: a slow response for an old query must not overwrite the
    // newer query's results or end its loading state.
    let stale = false;
    const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
    apiFetch<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`)
      .then(res => {
        if (!stale) setResults(res.data);
      })
      .catch(err => {
        if (stale) return;
        console.error('Item search failed:', err);
        setResults([]);
        toast.error(err instanceof Error ? err.message : 'Failed to search items');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  const addItem = (item: SrdItem) => {
    onChange([...value, { itemName: item.name, weight: 1, qty: [1, 1] }]);
    setSearchInput('');
    setQuery('');
    setResults([]);
  };

  const updateEntry = (index: number, entry: LootTemplateItemEntry) => {
    onChange(value.map((e, i) => (i === index ? entry : e)));
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const inList = new Set(value.map(e => e.itemName));
  const pickable = results.filter(r => !inList.has(r.name));

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No items yet — search the catalog below to add one.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li key={entry.itemName} className="flex flex-wrap items-center gap-2">
              <span className="w-32 truncate text-sm font-medium text-gray-900 dark:text-white">
                {entry.itemName}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">weight</span>
              <WeightInput
                value={entry.weight}
                ariaLabel={`${entry.itemName} weight`}
                onCommit={weight => updateEntry(index, { ...value[index], weight })}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">qty</span>
              <RangeInputPair
                value={entry.qty}
                floor={1}
                labelPrefix={`${entry.itemName} qty`}
                onChange={qty => updateEntry(index, { ...value[index], qty })}
              />
              <button
                type="button"
                aria-label={`Remove ${entry.itemName}`}
                onClick={() => removeEntry(index)}
                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          type="text"
          aria-label="Search items"
          placeholder="Search items to add…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {query &&
          (loading ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
          ) : pickable.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No matching items for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {pickable.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`Add ${item.name}`}
                    onClick={() => addItem(item)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {item.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
