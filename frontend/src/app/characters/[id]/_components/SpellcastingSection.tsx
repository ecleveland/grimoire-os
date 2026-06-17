'use client';

import { useState } from 'react';
import type { AbilityScores, Character, SpellEntry, SrdSpell } from '@/lib/types';
import { abilityModifier, formatModifier, ABILITY_KEY_TO_NAME } from './utils';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import { parseNonNegativeInt, togglePip } from '@/lib/character-play';
import {
  addSpellEntry,
  removeSpellEntryAt,
  togglePreparedAt,
  toSpellEntry,
} from '@/lib/character-spells';
import SrdSpellSearch from '@/components/SrdSpellSearch';

type SpellcastingSectionProps = { character: Character } & PlayControlProps;

const MAX_SPELL_LEVEL = 9;

const textInputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';

function getAbilityScore(abilityScores: AbilityScores, abilityName: string): number {
  const entry = Object.entries(ABILITY_KEY_TO_NAME).find(([, name]) => name === abilityName);
  if (!entry) return 10;
  return abilityScores[entry[0] as keyof AbilityScores];
}

export default function SpellcastingSection(props: SpellcastingSectionProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);

  // Add-spell form drafts (a free-typed entry; the catalog picker adds directly).
  const [addName, setAddName] = useState('');
  const [addLevel, setAddLevel] = useState('1');

  if (!character.spellcastingAbility) return null;

  const abilityScore = getAbilityScore(character.abilityScores, character.spellcastingAbility);
  const modifier = abilityModifier(abilityScore);
  const spellSlots = character.spellSlots ?? [];

  const setSlotUsed = (level: number, used: number) => {
    patch({ spellSlots: spellSlots.map(s => (s.level === level ? { ...s, used } : s)) });
  };

  // The table sorts by level (cantrips first) then name, but mutations must hit
  // the *stored* array, so carry each entry's original index through the sort.
  const storedSpells = character.spells ?? [];
  const rows = storedSpells
    .map((spell, index) => ({ spell, index }))
    .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
  const hasSpellSlots = spellSlots.length > 0;
  const hasSpells = storedSpells.length > 0;
  const showSpells = hasSpells || editable;

  const removeSpell = (index: number) => patch({ spells: removeSpellEntryAt(storedSpells, index) });
  const togglePrepared = (index: number) =>
    patch({ spells: togglePreparedAt(storedSpells, index) });

  const addCatalogSpell = (spell: SrdSpell) => {
    patch({ spells: addSpellEntry(storedSpells, toSpellEntry(spell)) });
  };

  const addFreeSpell = () => {
    const name = addName.trim();
    if (!name) return;
    const level = Math.min(MAX_SPELL_LEVEL, parseNonNegativeInt(addLevel));
    const entry: SpellEntry = { level, name, prepared: level > 0 };
    patch({ spells: addSpellEntry(storedSpells, entry) });
    setAddName('');
    setAddLevel('1');
  };

  return (
    <div className="space-y-4">
      {/* Spellcasting Stats Bar */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {character.spellcastingAbility}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spellcasting Ability</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatModifier(modifier)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spellcasting Modifier</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {character.spellSaveDC}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spell Save DC</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatModifier(character.spellAttackBonus ?? 0)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spell Attack Bonus</div>
          </div>
        </div>
      </div>

      {/* Spell Slots Grid */}
      {hasSpellSlots && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Spell Slots
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {spellSlots.map(slot => (
              <div
                key={slot.level}
                data-testid={`spell-slots-level-${slot.level}`}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14">
                  Level {slot.level}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: slot.total }, (_, i) => {
                    const isUsed = i < slot.used;
                    const testId = isUsed ? 'slot-filled' : 'slot-empty';
                    const pipClass = `inline-block w-3 h-3 rotate-45 ${
                      isUsed
                        ? 'bg-indigo-600 dark:bg-indigo-400'
                        : 'border border-gray-400 dark:border-gray-500'
                    }`;
                    return editable ? (
                      <button
                        key={i}
                        type="button"
                        data-testid={testId}
                        aria-label={`Level ${slot.level} slot ${i + 1}`}
                        aria-pressed={isUsed}
                        disabled={isSaving}
                        onClick={() => setSlotUsed(slot.level, togglePip(slot.used, i, slot.total))}
                        className={`${pipClass} disabled:opacity-50`}
                      />
                    ) : (
                      <span key={i} data-testid={testId} className={pipClass} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cantrips & Prepared Spells */}
      {showSpells && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Cantrips & Prepared Spells
          </h3>
          {hasSpells && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-center font-medium py-1 w-12">Prep</th>
                  <th className="text-center font-medium py-1 w-10">Lv</th>
                  <th className="text-left font-medium py-1">Name</th>
                  <th className="text-left font-medium py-1">Time</th>
                  <th className="text-left font-medium py-1">Range</th>
                  <th
                    className="text-center font-medium py-1 w-16"
                    title="Concentration · Ritual · Material"
                  >
                    C·R·M
                  </th>
                  <th className="text-left font-medium py-1">Notes</th>
                  {editable && <th className="text-right font-medium py-1 w-16">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ spell, index }) => (
                  <tr
                    key={spell.spellId ?? `${spell.name}-${index}`}
                    data-testid={`spell-${spell.name}`}
                    className="text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <td className="text-center py-0.5">
                      {spell.level === 0 ? (
                        <span className="text-gray-400" aria-label="Cantrip (always prepared)">
                          —
                        </span>
                      ) : editable ? (
                        <button
                          type="button"
                          data-testid={spell.prepared ? 'prepared-yes' : 'prepared-no'}
                          aria-label={`Toggle prepared ${spell.name}`}
                          aria-pressed={!!spell.prepared}
                          disabled={isSaving}
                          onClick={() => togglePrepared(index)}
                          className={`inline-block w-3 h-3 rounded-sm disabled:opacity-50 ${
                            spell.prepared
                              ? 'bg-indigo-600 dark:bg-indigo-400'
                              : 'border border-gray-400 dark:border-gray-500'
                          }`}
                        />
                      ) : (
                        <span
                          data-testid={spell.prepared ? 'prepared-yes' : 'prepared-no'}
                          aria-label={spell.prepared ? 'Prepared' : 'Not prepared'}
                          className={`inline-block w-3 h-3 rounded-sm ${
                            spell.prepared
                              ? 'bg-indigo-600 dark:bg-indigo-400'
                              : 'border border-gray-400 dark:border-gray-500'
                          }`}
                        />
                      )}
                    </td>
                    <td className="text-center py-0.5">{spell.level}</td>
                    <td className="py-0.5 font-medium">{spell.name}</td>
                    <td className="py-0.5 text-gray-500 dark:text-gray-400">
                      {spell.castingTime ?? '—'}
                    </td>
                    <td className="py-0.5 text-gray-500 dark:text-gray-400">
                      {spell.range ?? '—'}
                    </td>
                    <td className="text-center py-0.5">
                      <span className="inline-flex gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                        {spell.concentration && (
                          <abbr title="Concentration" data-testid="flag-concentration">
                            C
                          </abbr>
                        )}
                        {spell.ritual && (
                          <abbr title="Ritual" data-testid="flag-ritual">
                            R
                          </abbr>
                        )}
                        {spell.material && (
                          <abbr title="Material" data-testid="flag-material">
                            M
                          </abbr>
                        )}
                      </span>
                    </td>
                    <td className="py-0.5 text-gray-500 dark:text-gray-400">{spell.notes ?? ''}</td>
                    {editable && (
                      <td className="py-0.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`Remove ${spell.name}`}
                          onClick={() => removeSpell(index)}
                          disabled={isSaving}
                          className="px-2 py-1 text-xs font-medium rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add-spell form (owner only) */}
          {editable && (
            <div data-testid="add-spell-form" className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="New spell name"
                  placeholder="Spell name"
                  value={addName}
                  disabled={isSaving}
                  onChange={e => setAddName(e.target.value)}
                  className={`flex-1 min-w-[8rem] ${textInputClass}`}
                />
                <label
                  htmlFor="add-spell-level"
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  Lv
                </label>
                <input
                  id="add-spell-level"
                  type="number"
                  min={0}
                  max={MAX_SPELL_LEVEL}
                  aria-label="New spell level"
                  value={addLevel}
                  disabled={isSaving}
                  onChange={e => setAddLevel(e.target.value)}
                  className={`w-16 ${textInputClass}`}
                />
                <button
                  type="button"
                  onClick={addFreeSpell}
                  disabled={isSaving || addName.trim() === ''}
                  className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Add spell
                </button>
              </div>
              <SrdSpellSearch
                onSelect={addCatalogSpell}
                disabled={isSaving}
                placeholder="Search the catalog to add a spell…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
