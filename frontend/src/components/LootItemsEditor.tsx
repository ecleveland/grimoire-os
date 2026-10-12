'use client';

import { useState } from 'react';
import type { LootTemplateItemEntry, SrdItem } from '@grimoire-os/shared';
import RangeInputPair from '@/components/RangeInputPair';
import CatalogItemPicker from '@/components/CatalogItemPicker';

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
 * New entries are picked from the items catalog through `CatalogItemPicker`
 * because generation resolves entries to catalog ids by exact `Item.name`, so
 * free-typed names would silently produce id-less loot. Loot templates resolve
 * names against the SRD and shared catalog only, so the picker asks for that tier.
 */
export default function LootItemsEditor({ value, onChange }: Props) {
  const addItem = (item: SrdItem) => {
    onChange([...value, { itemName: item.name, weight: 1, qty: [1, 1] }]);
  };

  const updateEntry = (index: number, entry: LootTemplateItemEntry) => {
    onChange(value.map((e, i) => (i === index ? entry : e)));
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const inList = new Set(value.map(e => e.itemName));

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
              <span
                title="Relative pick chance compared to the other items in this template (ratios, not percentages)"
                className="text-xs text-gray-500 dark:text-gray-400 cursor-help"
              >
                weight
              </span>
              <WeightInput
                value={entry.weight}
                ariaLabel={`${entry.itemName} weight`}
                onCommit={weight => updateEntry(index, { ...value[index], weight })}
              />
              <span
                title="How many copies are rolled when this item is picked (inclusive min–max)"
                className="text-xs text-gray-500 dark:text-gray-400 cursor-help"
              >
                qty
              </span>
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
      {value.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Items are picked by relative weight; qty is how many drop when picked.
        </p>
      )}

      <CatalogItemPicker
        tier="global"
        inputLabel="Search items"
        placeholder="Search items to add…"
        exclude={item => inList.has(item.name)}
        onSelect={addItem}
      />
    </div>
  );
}
