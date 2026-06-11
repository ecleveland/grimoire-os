'use client';

import type { LootTemplateCoinage } from '@grimoire-os/shared';
import RangeInputPair from '@/components/RangeInputPair';

const DENOMINATIONS = [
  { key: 'gp', label: 'Gold (gp)' },
  { key: 'sp', label: 'Silver (sp)' },
  { key: 'cp', label: 'Copper (cp)' },
] as const;

interface Props {
  value: LootTemplateCoinage;
  onChange: (next: LootTemplateCoinage) => void;
}

/**
 * Structured editor for a loot template's per-denomination coinage ranges
 * (VEG-303). Range semantics (drafts while typing, blur-time normalization,
 * integer bounds ≥ 0) live in the shared RangeInputPair.
 */
export default function CoinRangeEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      {DENOMINATIONS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-24 text-sm text-gray-700 dark:text-gray-200">{label}</span>
          <RangeInputPair
            value={value[key]}
            floor={0}
            labelPrefix={key}
            onChange={range => onChange({ ...value, [key]: range })}
          />
        </div>
      ))}
    </div>
  );
}
