'use client';

import type { Character } from '@/lib/types';
import { abilityModifier, formatModifier, ABILITY_KEY_TO_NAME } from './utils';
import type { AbilityScores } from '@/lib/types';
import type { PlayControlProps } from './useCharacterMutation';
import { togglePip } from '@/lib/character-play';

type SpellcastingSectionProps = { character: Character } & PlayControlProps;

function getAbilityScore(abilityScores: AbilityScores, abilityName: string): number {
  const entry = Object.entries(ABILITY_KEY_TO_NAME).find(([, name]) => name === abilityName);
  if (!entry) return 10;
  return abilityScores[entry[0] as keyof AbilityScores];
}

export default function SpellcastingSection({
  character,
  isOwner,
  onPatch,
  isSaving,
}: SpellcastingSectionProps) {
  if (!character.spellcastingAbility) return null;

  const abilityScore = getAbilityScore(character.abilityScores, character.spellcastingAbility);
  const modifier = abilityModifier(abilityScore);
  const spellSlots = character.spellSlots ?? [];
  const editable = !!isOwner && !!onPatch;

  const setSlotUsed = (level: number, used: number) => {
    if (!onPatch) return;
    onPatch({ spellSlots: spellSlots.map(s => (s.level === level ? { ...s, used } : s)) });
  };
  // Sort by level (cantrips first), then name, mirroring the 2024 sheet table.
  const spells = [...(character.spells ?? [])].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name)
  );
  const hasSpellSlots = spellSlots.length > 0;
  const hasSpells = spells.length > 0;

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
      {hasSpells && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Cantrips & Prepared Spells
          </h3>
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
              </tr>
            </thead>
            <tbody>
              {spells.map((spell, i) => (
                <tr
                  key={spell.spellId ?? `${spell.name}-${i}`}
                  data-testid={`spell-${spell.name}`}
                  className="text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <td className="text-center py-0.5">
                    {spell.level === 0 ? (
                      <span className="text-gray-400" aria-label="Cantrip (always prepared)">
                        —
                      </span>
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
                  <td className="py-0.5 text-gray-500 dark:text-gray-400">{spell.range ?? '—'}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
