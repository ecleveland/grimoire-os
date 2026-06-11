'use client';

import { useState } from 'react';
import type { LootRange } from '@grimoire-os/shared';
import { normalizeRange, parseBound, setBound } from '@/lib/loot-range';

const inputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: LootRange;
  /** Lowest legal bound value (0 for coinage, 1 for qty). */
  floor: number;
  /** Aria-label prefix: `${labelPrefix} min` / `${labelPrefix} max`. */
  labelPrefix: string;
  onChange: (next: LootRange) => void;
}

/**
 * Min–max input pair backing a LootRange (VEG-303), shared by the coinage
 * and item-qty editors. While a field is being edited its raw text is kept
 * as a draft, so clearing it never commits a destructive floor value (which
 * would drag the other bound along); a transiently crossed range is allowed
 * and resolved on blur in favor of the bound the user touched.
 */
export default function RangeInputPair({ value, floor, labelPrefix, onChange }: Props) {
  const [drafts, setDrafts] = useState<{ min: string | null; max: string | null }>({
    min: null,
    max: null,
  });

  const handleChange = (bound: 'min' | 'max', raw: string) => {
    setDrafts(prev => ({ ...prev, [bound]: raw }));
    const parsed = parseBound(raw, floor);
    if (parsed !== null) onChange(setBound(value, bound, parsed));
  };

  const handleBlur = (bound: 'min' | 'max') => {
    setDrafts(prev => ({ ...prev, [bound]: null }));
    const next = normalizeRange(value, bound);
    if (next !== value) onChange(next);
  };

  const boundInput = (bound: 'min' | 'max', current: number) => (
    <input
      type="number"
      min={floor}
      aria-label={`${labelPrefix} ${bound}`}
      value={drafts[bound] ?? String(current)}
      onChange={e => handleChange(bound, e.target.value)}
      onBlur={() => handleBlur(bound)}
      className={inputClass}
    />
  );

  return (
    <>
      {boundInput('min', value[0])}
      <span className="text-sm text-gray-500 dark:text-gray-400">to</span>
      {boundInput('max', value[1])}
    </>
  );
}
