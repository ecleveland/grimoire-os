'use client';

import { useId } from 'react';
import type { Feature } from '@/lib/types';

const cell =
  'px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

const EMPTY_FEATURE: Feature = { name: '', source: '', description: '' };

interface FeaturesEditorProps {
  value: Feature[];
  onChange: (next: Feature[]) => void;
  /** Source suggestions (the character's class + species) for categorization. */
  sourceSuggestions?: string[];
}

/** Repeatable feature rows. The sheet groups these by `source` — matching the
 * class shows under Class Features, the species under Species Traits, anything
 * else under Feats. Blank rows (no name) are dropped on save. */
export default function FeaturesEditor({
  value,
  onChange,
  sourceSuggestions,
}: FeaturesEditorProps) {
  const listId = useId();
  const suggestions = (sourceSuggestions ?? []).filter(Boolean);

  const update = (i: number, patch: Partial<Feature>) =>
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { ...EMPTY_FEATURE }]);

  return (
    <div>
      <span className={labelClasses}>Features &amp; Traits</span>
      {value.length > 0 && (
        <div className="space-y-3 mb-2">
          {value.map((f, i) => (
            <div
              key={i}
              className="space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2"
            >
              <div className="grid grid-cols-12 gap-2 items-center">
                <input
                  aria-label="Feature name"
                  placeholder="Name"
                  value={f.name}
                  onChange={e => update(i, { name: e.target.value })}
                  className={`${cell} col-span-6`}
                />
                <input
                  aria-label="Feature source"
                  placeholder="Source (class / species / feat)"
                  list={suggestions.length ? listId : undefined}
                  value={f.source ?? ''}
                  onChange={e => update(i, { source: e.target.value })}
                  className={`${cell} col-span-5`}
                />
                <button
                  type="button"
                  aria-label={`Remove feature ${i + 1}`}
                  onClick={() => remove(i)}
                  className="col-span-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  ×
                </button>
              </div>
              <textarea
                aria-label="Feature description"
                placeholder="Description"
                rows={2}
                value={f.description ?? ''}
                onChange={e => update(i, { description: e.target.value })}
                className={`${cell} w-full`}
              />
            </div>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <button
        type="button"
        onClick={add}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        + Add feature
      </button>
    </div>
  );
}
