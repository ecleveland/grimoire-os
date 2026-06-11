'use client';

import type { LootRange, LootTemplateCoinage } from '@grimoire-os/shared';

const DENOMINATIONS = [
  { key: 'gp', label: 'Gold (gp)' },
  { key: 'sp', label: 'Silver (sp)' },
  { key: 'cp', label: 'Copper (cp)' },
] as const;

type Denomination = (typeof DENOMINATIONS)[number]['key'];

const inputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: LootTemplateCoinage;
  onChange: (next: LootTemplateCoinage) => void;
}

/**
 * Structured editor for a loot template's per-denomination coinage ranges
 * (VEG-303). Keeps every range valid by construction: values are floored to
 * non-negative integers, and moving one bound past the other drags the other
 * bound along instead of producing min > max.
 */
export default function CoinRangeEditor({ value, onChange }: Props) {
  const handleChange = (denom: Denomination, bound: 'min' | 'max', raw: string) => {
    const parsed = Math.max(0, Math.floor(Number(raw) || 0));
    const [min, max] = value[denom];
    const next: LootRange =
      bound === 'min' ? [parsed, Math.max(parsed, max)] : [Math.min(min, parsed), parsed];
    onChange({ ...value, [denom]: next });
  };

  return (
    <div className="space-y-2">
      {DENOMINATIONS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-24 text-sm text-gray-700 dark:text-gray-200">{label}</span>
          <input
            type="number"
            min={0}
            aria-label={`${key} min`}
            value={value[key][0]}
            onChange={e => handleChange(key, 'min', e.target.value)}
            className={inputClass}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">to</span>
          <input
            type="number"
            min={0}
            aria-label={`${key} max`}
            value={value[key][1]}
            onChange={e => handleChange(key, 'max', e.target.value)}
            className={inputClass}
          />
        </div>
      ))}
    </div>
  );
}
