'use client';

import { useId, useState } from 'react';
import type { NpcLootOverrides } from '@/lib/types';

interface LootOddsAdvancedProps {
  value: NpcLootOverrides | null | undefined;
  onChange: (value: NpcLootOverrides | null) => void;
}

type Knob = 'trinketChance' | 'magicItemChance' | 'itemCountDie' | 'coinageMultiplier';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

const sliderClass = 'w-full accent-indigo-600 cursor-pointer disabled:cursor-not-allowed';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

const helperClass = 'mt-1 text-xs text-gray-500 dark:text-gray-400';

export default function LootOddsAdvanced({ value, onChange }: LootOddsAdvancedProps) {
  const [open, setOpen] = useState(false);
  const current = value ?? {};

  const isOverridden = (knob: Knob) => current[knob] !== undefined;

  const update = (knob: Knob, next: number | string | undefined) => {
    const merged: NpcLootOverrides = { ...current };
    if (next === undefined || next === '') {
      delete merged[knob];
    } else if (knob === 'itemCountDie') {
      merged.itemCountDie = next as string;
    } else {
      merged[knob] = Number(next);
    }
    if (Object.keys(merged).length === 0) {
      onChange(null);
    } else {
      onChange(merged);
    }
  };

  const reset = (knob: Knob) => update(knob, undefined);

  const resetAll = () => onChange(null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        <span>Loot Odds (Advanced)</span>
        <span className="text-gray-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <Slider
            knobName="trinket chance"
            label="Trinket Chance (%)"
            value={current.trinketChance}
            overridden={isOverridden('trinketChance')}
            onChange={v => update('trinketChance', v)}
            onReset={() => reset('trinketChance')}
          />
          <Slider
            knobName="magic item chance"
            label="Magic Item Chance (%)"
            value={current.magicItemChance}
            overridden={isOverridden('magicItemChance')}
            onChange={v => update('magicItemChance', v)}
            onReset={() => reset('magicItemChance')}
          />
          <TextKnob
            knobName="item count die"
            label="Item Count Die"
            placeholder="e.g. 1d3"
            value={current.itemCountDie ?? ''}
            overridden={isOverridden('itemCountDie')}
            onChange={v => update('itemCountDie', v)}
            onReset={() => reset('itemCountDie')}
          />
          <NumberKnob
            knobName="coinage multiplier"
            label="Coinage Multiplier"
            value={current.coinageMultiplier}
            overridden={isOverridden('coinageMultiplier')}
            onChange={v => update('coinageMultiplier', v)}
            onReset={() => reset('coinageMultiplier')}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetAll}
              disabled={Object.keys(current).length === 0}
              className="text-sm text-indigo-600 hover:text-indigo-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Reset all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface KnobShared {
  knobName: string;
  label: string;
  overridden: boolean;
  onReset: () => void;
}

function ResetButton({ knobName, onReset }: { knobName: string; onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={`Reset ${knobName}`}
      className="text-xs text-indigo-600 hover:text-indigo-700"
    >
      Reset
    </button>
  );
}

function HelperText({ overridden, value }: { overridden: boolean; value?: string }) {
  return <p className={helperClass}>{overridden ? (value ?? '') : 'Using global default'}</p>;
}

interface SliderProps extends KnobShared {
  value: number | undefined;
  onChange: (value: number) => void;
}

function Slider({ knobName, label, value, overridden, onChange, onReset }: SliderProps) {
  const id = useId();
  const display = value ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {overridden && <ResetButton knobName={knobName} onReset={onReset} />}
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={display}
        className={sliderClass}
        onChange={e => onChange(Number(e.target.value))}
      />
      <HelperText overridden={overridden} value={`${display}%`} />
    </div>
  );
}

interface TextKnobProps extends KnobShared {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function TextKnob({
  knobName,
  label,
  value,
  overridden,
  placeholder,
  onChange,
  onReset,
}: TextKnobProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {overridden && <ResetButton knobName={knobName} onReset={onReset} />}
      </div>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        className={inputClass}
        onChange={e => onChange(e.target.value)}
      />
      {!overridden && <HelperText overridden={false} />}
    </div>
  );
}

interface NumberKnobProps extends KnobShared {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function NumberKnob({ knobName, label, value, overridden, onChange, onReset }: NumberKnobProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {overridden && <ResetButton knobName={knobName} onReset={onReset} />}
      </div>
      <input
        id={id}
        type="number"
        min={0}
        step={0.1}
        value={value ?? ''}
        className={inputClass}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
      {!overridden && <HelperText overridden={false} />}
    </div>
  );
}
