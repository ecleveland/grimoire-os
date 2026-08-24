'use client';

import { useState } from 'react';
import type { Character, SpellEntry, SrdClass, SrdSpell } from '@/lib/types';
import { formatModifier } from './utils';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import { togglePip } from '@/lib/character-play';
import { clampIntToRange } from '@/lib/form-helpers';
import { resolveSpellSlotView, writeSlotUsed } from '@/lib/spell-slot-view';
import {
  addSpellEntry,
  removeSpellEntryAt,
  spellPreparationSummary,
  togglePreparedAt,
  toSpellEntry,
} from '@/lib/character-spells';
import { useApiQuery } from '@/lib/query';
import SrdSpellSearch from '@/components/SrdSpellSearch';
import SpellCardModal from './SpellCardModal';

type SpellcastingSectionProps = { character: Character } & PlayControlProps;

const MAX_SPELL_LEVEL = 9;

const textInputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';

export default function SpellcastingSection(props: SpellcastingSectionProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);

  // Add-spell form drafts (a free-typed entry; the catalog picker adds directly).
  const [addName, setAddName] = useState('');
  const [addLevel, setAddLevel] = useState('1');

  // Spell-card popover (VEG-413): the entry whose detail card is open, or null.
  // Read-only — available to owner and viewer alike.
  const [selectedSpell, setSelectedSpell] = useState<SpellEntry | null>(null);

  // Resolve the class's spellcasting progression to show the prepared/known
  // budget (VEG-405). The list is cached and shared with the guided builder;
  // skip the fetch entirely for non-casters. Called before the early return to
  // keep the hook order stable.
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes', {
    enabled: !!character.spellcastingAbility,
  });

  // Gate on the STORED spellcastingAbility column, deliberately: the computed
  // block also resolves a class-default ability when the column is null, and
  // gating on it would newly reveal the section for such characters — a
  // visibility change out of scope for VEG-412. Past the gate the backend
  // guarantees `computed.spellcasting` (resolved from this same column), so the
  // null check only narrows the type.
  const spellcasting = character.computed.spellcasting;
  if (!character.spellcastingAbility || !spellcasting) return null;

  // Slot maxima: the computed class progression owns every level it covers;
  // stored-only levels (multiclass/DM grants) are kept; `used` comes from the
  // stored array (VEG-412 reconciliation — rules in @/lib/spell-slot-view).
  const slotViews = resolveSpellSlotView(character.spellSlots, character.computed.spellSlots);

  const setSlotUsed = (level: number, used: number, max: number) => {
    patch({ spellSlots: writeSlotUsed(character.spellSlots, level, used, max) });
  };

  // The table sorts by level (cantrips first) then name, but mutations must hit
  // the *stored* array, so carry each entry's original index through the sort.
  const storedSpells = character.spells ?? [];
  const rows = storedSpells
    .map((spell, index) => ({ spell, index }))
    .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
  // Prepared/known budget for this class+level (VEG-405). Null until the class
  // list resolves or for a class with no spellcasting data — the indicator is
  // simply omitted then.
  const classSpellcasting = classesQuery.data?.find(c => c.name === character.class)?.spellcasting;
  const prepSummary = classSpellcasting
    ? spellPreparationSummary(
        classSpellcasting,
        character.level,
        spellcasting.modifier,
        storedSpells
      )
    : null;

  const hasSpellSlots = slotViews.length > 0;
  const hasSpells = storedSpells.length > 0;
  // Show the spells card when there are spells, the owner can add them, or there
  // is a budget to surface (so a read-only caster with no spells still sees it).
  const showSpells = hasSpells || editable || prepSummary !== null;

  const removeSpell = (index: number) => patch({ spells: removeSpellEntryAt(storedSpells, index) });
  const togglePrepared = (index: number) =>
    patch({ spells: togglePreparedAt(storedSpells, index) });

  const addCatalogSpell = (spell: SrdSpell) => {
    patch({ spells: addSpellEntry(storedSpells, toSpellEntry(spell)) });
  };

  const addFreeSpell = () => {
    const name = addName.trim();
    if (!name) return;
    const level = clampIntToRange(addLevel, 0, MAX_SPELL_LEVEL);
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
              {formatModifier(spellcasting.modifier)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spellcasting Modifier</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {spellcasting.saveDC}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Spell Save DC</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatModifier(spellcasting.attackBonus)}
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
            {slotViews.map(slot => (
              <div
                key={slot.level}
                data-testid={`spell-slots-level-${slot.level}`}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14">
                  Level {slot.level}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: slot.max }, (_, i) => {
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
                        onClick={() =>
                          setSlotUsed(slot.level, togglePip(slot.used, i, slot.max), slot.max)
                        }
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
          {prepSummary && (
            <div
              data-testid="prep-summary"
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-3 text-xs"
            >
              <span
                data-testid="cantrip-summary"
                className={
                  prepSummary.cantrips.over
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-gray-500 dark:text-gray-400'
                }
              >
                Cantrips {prepSummary.cantrips.count} / {prepSummary.cantrips.allowed}
              </span>
              <span
                data-testid="leveled-summary"
                className={
                  prepSummary.leveled.over
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-gray-500 dark:text-gray-400'
                }
              >
                {prepSummary.leveled.mode === 'prepared' ? 'Prepared' : 'Known'}{' '}
                {prepSummary.leveled.count} / {prepSummary.leveled.allowed}
              </span>
              {(prepSummary.cantrips.over || prepSummary.leveled.over) && (
                <span
                  data-testid="prep-over-warning"
                  role="status"
                  className="text-amber-600 dark:text-amber-400"
                >
                  Over your limit
                </span>
              )}
            </div>
          )}
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
                    <td className="py-0.5 font-medium">
                      <button
                        type="button"
                        aria-label={`View ${spell.name} details`}
                        onClick={() => setSelectedSpell(spell)}
                        className="text-left text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-sm"
                      >
                        {spell.name}
                      </button>
                    </td>
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

      <SpellCardModal entry={selectedSpell} onClose={() => setSelectedSpell(null)} />
    </div>
  );
}
