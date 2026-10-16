'use client';

import { useState } from 'react';
import { aggregateCombatantLoot } from '@grimoire-os/shared';
import type { Encounter } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import LootDisplay from './LootDisplay';

export interface EncounterLootPanelProps {
  encounter: Encounter;
  writePending: boolean;
  autoRollLoot: boolean;
  onAutoRollLootChange: (checked: boolean) => void;
  /** Rolls loot for every monster combatant, replacing existing drops. */
  onRollAll: () => void;
}

export default function EncounterLootPanel({
  encounter,
  writePending,
  autoRollLoot,
  onAutoRollLootChange,
  onRollAll,
}: EncounterLootPanelProps) {
  // Encounter-wide roll replaces existing drops (backend re-rolls every
  // monster combatant) — confirm before doing that destructively.
  const [confirmBulkRoll, setConfirmBulkRoll] = useState(false);
  const hasMonsterCombatants = encounter.combatants.some(c => c.monsterId);
  const rolledDropCount = encounter.combatants.filter(c => c.loot).length;
  // Derived fresh from the combatants (same pure helper the backend uses), so
  // the total can never drift from the per-monster drops it sums.
  const lootTotal = encounter.combatants.some(c => c.loot)
    ? aggregateCombatantLoot(encounter.combatants)
    : null;

  return (
    <>
      <div className="mt-6 p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Encounter loot</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={autoRollLoot}
                onChange={e => onAutoRollLootChange(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
              />
              Auto-roll loot on death
            </label>
            <button
              type="button"
              onClick={() => {
                // Rolling the whole encounter replaces existing drops on the
                // backend — confirm before clobbering anything already rolled.
                if (rolledDropCount > 0) setConfirmBulkRoll(true);
                else onRollAll();
              }}
              disabled={!hasMonsterCombatants || writePending}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Roll loot for encounter
            </button>
          </div>
        </div>
        {lootTotal ? (
          <div className="mt-3 text-sm">
            <LootDisplay coinage={lootTotal.coinage} items={lootTotal.items} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No loot rolled yet.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmBulkRoll}
        onOpenChange={setConfirmBulkRoll}
        title="Reroll existing loot?"
        description={`Rolling loot for the encounter will replace the ${rolledDropCount} drop${
          rolledDropCount === 1 ? '' : 's'
        } already rolled.`}
        confirmLabel="Roll all"
        onConfirm={onRollAll}
      />
    </>
  );
}
