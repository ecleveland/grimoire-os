'use client';

import { useState } from 'react';
import type { SrdMonster } from '@/lib/types';
import { dexModifier, rollInitiative } from '@/lib/encounter-combatants';

export interface AddToEncounterResult {
  quantity: number;
  /** One initiative value per combatant; length equals `quantity`. */
  initiatives: number[];
}

interface Props {
  monster: SrdMonster;
  onConfirm: (result: AddToEncounterResult) => void;
  onCancel: () => void;
  /** Disables confirm while the parent is persisting. */
  submitting?: boolean;
  /** Injectable randomness for deterministic tests; defaults to Math.random. */
  rng?: () => number;
}

const DEFAULT_INIT = '10';

function parseInit(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function resize(values: string[], length: number): string[] {
  if (values.length === length) return values;
  if (values.length > length) return values.slice(0, length);
  return [...values, ...Array(length - values.length).fill(DEFAULT_INIT)];
}

/**
 * Collects quantity + initiative for the "Add to encounter" action (VEG-260).
 * A "Same initiative for all" toggle keeps the common case one field, while
 * letting a DM set each combatant's initiative independently when it matters.
 * The toggle only appears for quantity > 1. Emits the resolved values upward;
 * name auto-numbering and persistence happen in the parent.
 */
export default function AddToEncounterDialog({
  monster,
  onConfirm,
  onCancel,
  submitting = false,
  rng = Math.random,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [shareInit, setShareInit] = useState(true);
  const [sharedInit, setSharedInit] = useState(DEFAULT_INIT);
  const [individualInits, setIndividualInits] = useState<string[]>([DEFAULT_INIT]);

  const rowCount = Math.max(1, quantity);
  const effectiveShared = quantity <= 1 || shareInit;

  function changeQuantity(value: string) {
    const next = parseInt(value, 10);
    const q = Number.isNaN(next) ? 1 : next;
    setQuantity(q);
    setIndividualInits(prev => resize(prev, Math.max(1, q)));
  }

  function autoRollShared() {
    setSharedInit(String(rollInitiative(monster, rng)));
  }

  function autoRollAll() {
    setIndividualInits(
      Array.from({ length: rowCount }, () => String(rollInitiative(monster, rng)))
    );
  }

  function autoRollRow(index: number) {
    setIndividualInits(prev =>
      prev.map((v, i) => (i === index ? String(rollInitiative(monster, rng)) : v))
    );
  }

  function setRow(index: number, value: string) {
    setIndividualInits(prev => prev.map((v, i) => (i === index ? value : v)));
  }

  function handleConfirm() {
    const q = Math.max(1, quantity);
    const initiatives = effectiveShared
      ? Array(q).fill(parseInit(sharedInit))
      : resize(individualInits, q).map(parseInit);
    onConfirm({ quantity: q, initiatives });
  }

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const rollButtonClass =
    'shrink-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors';

  return (
    <div data-testid="add-to-encounter" className="space-y-4">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add <span className="font-medium text-gray-900 dark:text-white">{monster.name}</span> to
          the encounter as{' '}
          {quantity > 1 ? `${Math.max(1, quantity)} NPC combatants` : 'an NPC combatant'}.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          AC {monster.armorClass} · HP {monster.hitPoints} · DEX mod{' '}
          {dexModifier(monster) >= 0 ? `+${dexModifier(monster)}` : dexModifier(monster)}
        </p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Quantity</span>
        <input
          type="number"
          min={1}
          aria-label="Quantity"
          value={quantity}
          onChange={e => changeQuantity(e.target.value)}
          className={`${fieldClass} w-24`}
        />
      </label>

      {quantity > 1 && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            aria-label="Same initiative for all"
            checked={shareInit}
            onChange={e => setShareInit(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Same initiative for all
        </label>
      )}

      {effectiveShared ? (
        <div className="flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Initiative
            </span>
            <input
              type="number"
              aria-label="Initiative"
              value={sharedInit}
              onChange={e => setSharedInit(e.target.value)}
              className={fieldClass}
            />
          </label>
          <button type="button" onClick={autoRollShared} className={rollButtonClass}>
            Auto-roll d20 + DEX mod
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Initiative per combatant
            </span>
            <button type="button" onClick={autoRollAll} className={rollButtonClass}>
              Auto-roll all
            </button>
          </div>
          {Array.from({ length: rowCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-sm text-gray-600 dark:text-gray-400">
                {monster.name} #{i + 1}
              </span>
              <input
                type="number"
                aria-label={`Initiative for combatant ${i + 1}`}
                value={individualInits[i] ?? DEFAULT_INIT}
                onChange={e => setRow(i, e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                aria-label={`Roll d20 for combatant ${i + 1}`}
                onClick={() => autoRollRow(i)}
                className={rollButtonClass}
              >
                Roll
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add to encounter
        </button>
      </div>
    </div>
  );
}
