'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseCost } from '@grimoire-os/shared';
import { apiFetch } from '@/lib/api';
import type { Currency, PaginatedResponse, ShopLineItem, SrdItem } from '@/lib/types';

const LIMIT = 8;

// Coin denominations exposed in the price editor, high → low. Electrum is
// omitted: it's vestigial in play and the coin module never emits it, so a
// blank ep on every row would just be noise (it still round-trips as 0).
const DENOMS: { key: keyof Currency; label: string }[] = [
  { key: 'pp', label: 'pp' },
  { key: 'gp', label: 'gp' },
  { key: 'sp', label: 'sp' },
  { key: 'cp', label: 'cp' },
];

const ZERO_PRICE: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

const numberInputClass =
  'w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

const textInputClass =
  'flex-1 min-w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: ShopLineItem[];
  onChange: (next: ShopLineItem[]) => void;
}

// Default a line's sale price from the catalog `cost` string ("500 gp",
// "Free", "Varies"…). parseCost returns null for non-fixed prices, so those
// fall back to free (all-zero) for the DM to fill in.
function priceFromCost(cost: string | undefined): Currency {
  return { ...ZERO_PRICE, ...(parseCost(cost ?? '') ?? {}) };
}

/**
 * Stock editor for a shop's line items (VEG-354). Lines are added from the
 * items catalog via a debounced `/srd/items` search (sale price defaults from
 * the catalog `cost`, DM-overridable) or hand-typed as ad-hoc custom lines
 * (e.g. "Mug of ale" for a tavern). `stock` blank means unlimited.
 *
 * Forked from LootItemsEditor's catalog picker; the shared extraction is
 * tracked in VEG-418.
 */
export default function ShopStockEditor({ value, onChange }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable per-line React keys. Custom lines have no itemId, so an index key
  // would mis-associate the editable name/price inputs (and lose focus) when a
  // line above is removed. We seed keys from the initial lines and keep the
  // array in lockstep with the value through our own add/remove handlers. The
  // editor mounts with its final initial value (the edit page renders the form
  // only after the shop loads), so no render-time reconcile is needed.
  // Counter seeds fresh keys; starts past the initial lines so handler-assigned
  // keys never collide with the index-seeded initial ones.
  const keyCounter = useRef(value.length);
  const [keys, setKeys] = useState<string[]>(() => value.map((_, i) => `line-${i}`));

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

  const addLine = (line: ShopLineItem) => {
    setKeys(k => [...k, `line-${keyCounter.current++}`]);
    onChange([...value, line]);
  };

  const addCatalogItem = (item: SrdItem) => {
    addLine({
      itemId: item.id,
      name: item.name,
      category: item.category,
      price: priceFromCost(item.cost),
      stock: null,
    });
    setSearchInput('');
    setQuery('');
    setResults([]);
  };

  const addCustomLine = () => {
    addLine({ itemId: null, name: '', price: { ...ZERO_PRICE }, stock: null });
  };

  const updateLine = (index: number, patch: Partial<ShopLineItem>) => {
    onChange(value.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const updatePrice = (index: number, denom: keyof Currency, raw: string) => {
    const n = raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw)));
    const safe = Number.isFinite(n) ? n : 0;
    updateLine(index, { price: { ...value[index].price, [denom]: safe } });
  };

  const updateStock = (index: number, raw: string) => {
    // Blank = unlimited (null); otherwise a non-negative integer count.
    if (raw.trim() === '') {
      updateLine(index, { stock: null });
      return;
    }
    const n = Math.max(0, Math.floor(Number(raw)));
    updateLine(index, { stock: Number.isFinite(n) ? n : 0 });
  };

  const removeLine = (index: number) => {
    setKeys(k => k.filter((_, i) => i !== index));
    onChange(value.filter((_, i) => i !== index));
  };

  // Catalog lines dedupe by itemId so a result already stocked is hidden;
  // custom (id-less) lines never suppress catalog results.
  const inList = new Set(value.map(line => line.itemId).filter(Boolean));
  const pickable = results.filter(r => !inList.has(r.id));

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No items yet — search the catalog or add a custom line below.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((line, index) => (
            <li
              key={keys[index]}
              className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {line.itemId ? (
                <span className="w-40 truncate text-sm font-medium text-gray-900 dark:text-white">
                  {line.name}
                </span>
              ) : (
                <input
                  type="text"
                  aria-label={`Line ${index + 1} name`}
                  placeholder="Item name"
                  value={line.name}
                  onChange={e => updateLine(index, { name: e.target.value })}
                  className={textInputClass}
                />
              )}

              <span
                className="flex items-center gap-1"
                role="group"
                aria-label={`Line ${index + 1} price`}
              >
                {DENOMS.map(({ key, label }) => (
                  <span key={key} className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Line ${index + 1} ${label}`}
                      value={String(line.price[key] ?? 0)}
                      onChange={e => updatePrice(index, key, e.target.value)}
                      className={numberInputClass}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  </span>
                ))}
              </span>

              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  aria-label={`Line ${index + 1} stock`}
                  placeholder="∞"
                  value={line.stock ?? ''}
                  onChange={e => updateStock(index, e.target.value)}
                  className={numberInputClass}
                />
                <span
                  title="Remaining stock; blank = unlimited"
                  className="text-xs text-gray-500 dark:text-gray-400 cursor-help"
                >
                  stock
                </span>
              </span>

              <button
                type="button"
                aria-label={`Remove ${line.name || `line ${index + 1}`}`}
                onClick={() => removeLine(index)}
                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Leave stock blank for unlimited. Prices default from the catalog and are editable.
        </p>
      )}

      <div>
        <div className="flex gap-2">
          <input
            type="text"
            aria-label="Search items"
            placeholder="Search the catalog to add an item…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={addCustomLine}
            className="shrink-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Add custom line
          </button>
        </div>
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
                    onClick={() => addCatalogItem(item)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {item.cost ? `${item.cost} · ${item.category}` : item.category}
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
