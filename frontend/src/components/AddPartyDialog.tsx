'use client';

import { useState } from 'react';
import type { PartyCharacter } from '@/lib/types';
import { parseIntField, rollInitiativeMod } from '@/lib/encounter-combatants';
import type { PartyCombatantEntry } from '@/lib/encounter-combatants';

interface Props {
  /** Campaign party roster, fetched by the parent. */
  characters: PartyCharacter[];
  /** Combatant names already in the encounter — those PCs start deselected. */
  existingNames: string[];
  onConfirm: (entries: PartyCombatantEntry[]) => void;
  onCancel: () => void;
  /** Disables confirm while the parent is persisting. */
  submitting?: boolean;
  /** Injectable randomness for deterministic tests; defaults to Math.random. */
  rng?: () => number;
}

const DEFAULT_INIT = '10';

/**
 * Picks campaign PCs to add as combatants (VEG-283). Every PC starts selected
 * unless a combatant with the same name is already in the encounter; each row
 * carries its own initiative with a d20 + sheet-modifier auto-roll. Emits the
 * resolved entries upward; snapshotting, auto-numbering, and persistence
 * happen in the parent.
 */
export default function AddPartyDialog({
  characters,
  existingNames,
  onConfirm,
  onCancel,
  submitting = false,
  rng = Math.random,
}: Props) {
  const existing = new Set(existingNames);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(characters.filter(c => !existing.has(c.name.trim())).map(c => c.id))
  );
  const [inits, setInits] = useState<Record<string, string>>({});

  const initValue = (id: string) => inits[id] ?? DEFAULT_INIT;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rollRow(character: PartyCharacter) {
    setInits(prev => ({
      ...prev,
      [character.id]: String(rollInitiativeMod(character.initiative ?? 0, rng)),
    }));
  }

  function rollAll() {
    setInits(prev => {
      const next = { ...prev };
      for (const c of characters) {
        next[c.id] = String(rollInitiativeMod(c.initiative ?? 0, rng));
      }
      return next;
    });
  }

  function handleConfirm() {
    onConfirm(
      characters
        .filter(c => selected.has(c.id))
        .map(c => ({ character: c, initiative: parseIntField(initValue(c.id)) }))
    );
  }

  const fieldClass =
    'w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const rollButtonClass =
    'shrink-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors';

  if (characters.length === 0) {
    return (
      <div data-testid="add-party" className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No characters are attached to this campaign yet. Players can link their characters from
          the campaign page.
        </p>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="add-party" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add the party as combatants — AC and HP snapshot from each sheet.
        </p>
        <button type="button" onClick={rollAll} className={rollButtonClass}>
          Roll all
        </button>
      </div>

      <ul className="space-y-2">
        {characters.map(c => {
          const summary = [c.race, c.class, c.level].filter(v => v != null).join(' ');
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
            >
              <input
                type="checkbox"
                aria-label={`Add ${c.name}`}
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">{c.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {summary && <span>{summary} · </span>}
                  {/* A sheet missing AC/HP gets defaults on add — say so at the
                      point of decision instead of silently inventing numbers. */}
                  <span>
                    AC {c.armorClass ?? '— (uses 10)'} · HP{' '}
                    {c.hitPoints ? `${c.hitPoints.current}/${c.hitPoints.max}` : '— (uses 10/10)'}
                  </span>
                  {existing.has(c.name.trim()) && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      · already in encounter
                    </span>
                  )}
                </div>
              </div>
              <input
                type="number"
                aria-label={`Initiative for ${c.name}`}
                value={initValue(c.id)}
                onChange={e => setInits(prev => ({ ...prev, [c.id]: e.target.value }))}
                className={fieldClass}
              />
              <button
                type="button"
                aria-label={`Roll initiative for ${c.name}`}
                onClick={() => rollRow(c)}
                className={rollButtonClass}
                title={`d20 ${c.initiative != null && c.initiative >= 0 ? '+' : ''}${c.initiative ?? 0}`}
              >
                Roll
              </button>
            </li>
          );
        })}
      </ul>

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
          disabled={submitting || selected.size === 0}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add selected
        </button>
      </div>
    </div>
  );
}
