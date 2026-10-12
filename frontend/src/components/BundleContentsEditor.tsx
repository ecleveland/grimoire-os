'use client';

import type { SrdItem, SrdItemBundleComponent } from '@grimoire-os/shared';
import CatalogItemPicker from '@/components/CatalogItemPicker';

const numberInputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: SrdItemBundleComponent[];
  onChange: (next: SrdItemBundleComponent[]) => void;
  /** Item id of the pack being edited — excluded from search so it can't contain itself. */
  selfId?: string;
}

/**
 * Editor for an equipment pack's bundle contents (VEG-309). Components are
 * picked from the items catalog through `CatalogItemPicker` and stored by
 * catalog `itemId` (the backend persists `ItemBundleEntry.componentId`), with a
 * per-entry integer quantity ≥ 1. Pack components resolve against the SRD and
 * shared catalog only (see AdminItemsService.setBundleContents), so the picker
 * asks for that tier. The pack itself is filtered out so it cannot contain itself.
 */
export default function BundleContentsEditor({ value, onChange, selfId }: Props) {
  const addItem = (item: SrdItem) => {
    onChange([...value, { itemId: item.id, name: item.name, quantity: 1 }]);
  };

  const setQuantity = (index: number, quantity: number) => {
    onChange(value.map((e, i) => (i === index ? { ...e, quantity } : e)));
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const inList = new Set(value.map(e => e.itemId));

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No contents yet — search the catalog below to add an item.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li key={entry.itemId} className="flex flex-wrap items-center gap-2">
              <span className="w-40 truncate text-sm font-medium text-gray-900 dark:text-white">
                {entry.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">qty</span>
              <input
                type="number"
                min={1}
                aria-label={`${entry.name} quantity`}
                value={entry.quantity}
                onChange={e => {
                  const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                  setQuantity(index, n);
                }}
                className={numberInputClass}
              />
              <button
                type="button"
                aria-label={`Remove ${entry.name}`}
                onClick={() => removeEntry(index)}
                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <CatalogItemPicker
        tier="global"
        inputLabel="Search items"
        placeholder="Search items to add…"
        exclude={item => inList.has(item.id) || item.id === selfId}
        onSelect={addItem}
      />
    </div>
  );
}
