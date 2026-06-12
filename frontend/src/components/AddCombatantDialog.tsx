'use client';

import { useState } from 'react';
import { parseIntField } from '@/lib/encounter-combatants';
import type { ManualCombatantInput } from '@/lib/encounter-combatants';

interface Props {
  onConfirm: (input: ManualCombatantInput) => void;
  onCancel: () => void;
  /** Disables confirm while the parent is persisting. */
  submitting?: boolean;
}

const DEFAULT_STAT = '10';

/**
 * Collects the fields for an ad-hoc combatant (VEG-282): lairs, hazards,
 * summons, named NPCs — anything without an SRD stat block behind it. Emits
 * the raw values upward; name trimming/auto-numbering and persistence happen
 * in the parent.
 */
export default function AddCombatantDialog({ onConfirm, onCancel, submitting = false }: Props) {
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState(DEFAULT_STAT);
  const [hp, setHp] = useState(DEFAULT_STAT);
  const [maxHp, setMaxHp] = useState(DEFAULT_STAT);
  const [ac, setAc] = useState(DEFAULT_STAT);
  const [isNpc, setIsNpc] = useState(true);
  const [notes, setNotes] = useState('');

  function handleConfirm() {
    onConfirm({
      name,
      initiative: parseIntField(initiative),
      hp: parseIntField(hp),
      maxHp: parseIntField(maxHp),
      ac: parseIntField(ac),
      isNpc,
      notes,
    });
  }

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const labelClass = 'mb-1 block font-medium text-gray-700 dark:text-gray-300';

  return (
    <div data-testid="add-combatant" className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Add a combatant by hand — a lair action, hazard, summon, or named NPC. It won&apos;t be
        linked to a monster stat block.
      </p>

      <label className="block text-sm">
        <span className={labelClass}>Name</span>
        <input
          type="text"
          aria-label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          className={fieldClass}
        />
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="block text-sm">
          <span className={labelClass}>Initiative</span>
          <input
            type="number"
            aria-label="Initiative"
            value={initiative}
            onChange={e => setInitiative(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>HP</span>
          <input
            type="number"
            aria-label="HP"
            value={hp}
            onChange={e => setHp(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Max HP</span>
          <input
            type="number"
            aria-label="Max HP"
            value={maxHp}
            onChange={e => setMaxHp(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>AC</span>
          <input
            type="number"
            aria-label="AC"
            value={ac}
            onChange={e => setAc(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          aria-label="NPC"
          checked={isNpc}
          onChange={e => setIsNpc(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        NPC
      </label>

      <label className="block text-sm">
        <span className={labelClass}>Notes (optional)</span>
        <input
          type="text"
          aria-label="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className={fieldClass}
        />
      </label>

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
          disabled={submitting || name.trim() === ''}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add combatant
        </button>
      </div>
    </div>
  );
}
