'use client';

import type { Weapon } from '@/lib/types';

const cell =
  'px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

const EMPTY_WEAPON: Weapon = { name: '', attackBonus: '', damage: '', damageType: '', notes: '' };

interface WeaponsEditorProps {
  value: Weapon[];
  onChange: (next: Weapon[]) => void;
}

/** Repeatable weapon rows (the "Weapons & Damage" table). Blank rows — those
 * with no name — are dropped on save by `characterFormPayload`. */
export default function WeaponsEditor({ value, onChange }: WeaponsEditorProps) {
  const update = (i: number, patch: Partial<Weapon>) =>
    onChange(value.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { ...EMPTY_WEAPON }]);

  return (
    <div>
      <span className={labelClasses}>Weapons &amp; Damage</span>
      {value.length > 0 && (
        <div className="space-y-2 mb-2">
          {value.map((w, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                aria-label="Weapon name"
                placeholder="Name"
                value={w.name}
                onChange={e => update(i, { name: e.target.value })}
                className={`${cell} col-span-3`}
              />
              <input
                aria-label="Attack bonus"
                placeholder="Atk (+5)"
                value={w.attackBonus ?? ''}
                onChange={e => update(i, { attackBonus: e.target.value })}
                className={`${cell} col-span-2`}
              />
              <input
                aria-label="Damage"
                placeholder="Damage (1d8+3)"
                value={w.damage ?? ''}
                onChange={e => update(i, { damage: e.target.value })}
                className={`${cell} col-span-2`}
              />
              <input
                aria-label="Damage type"
                placeholder="Type"
                value={w.damageType ?? ''}
                onChange={e => update(i, { damageType: e.target.value })}
                className={`${cell} col-span-2`}
              />
              <input
                aria-label="Weapon notes"
                placeholder="Notes"
                value={w.notes ?? ''}
                onChange={e => update(i, { notes: e.target.value })}
                className={`${cell} col-span-2`}
              />
              <button
                type="button"
                aria-label={`Remove weapon ${i + 1}`}
                onClick={() => remove(i)}
                className="col-span-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        + Add weapon
      </button>
    </div>
  );
}
