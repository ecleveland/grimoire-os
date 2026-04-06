import type { Character } from '@/lib/types';
import { abilityModifier, formatModifier, ABILITY_KEY_TO_NAME } from './utils';
import type { AbilityScores } from '@/lib/types';

interface SpellcastingSectionProps {
  character: Character;
}

function getAbilityScore(abilityScores: AbilityScores, abilityName: string): number {
  const entry = Object.entries(ABILITY_KEY_TO_NAME).find(([, name]) => name === abilityName);
  if (!entry) return 10;
  return abilityScores[entry[0] as keyof AbilityScores];
}

export default function SpellcastingSection({ character }: SpellcastingSectionProps) {
  if (!character.spellcastingAbility) return null;

  const abilityScore = getAbilityScore(character.abilityScores, character.spellcastingAbility);
  const modifier = abilityModifier(abilityScore);
  const spellSlots = character.spellSlots ?? [];
  const knownSpells = character.knownSpells ?? [];
  const preparedSpells = character.preparedSpells ?? [];
  const hasSpellSlots = spellSlots.length > 0;
  const hasSpells = knownSpells.length > 0 || preparedSpells.length > 0;

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
            {spellSlots.map((slot) => (
              <div key={slot.level} data-testid={`spell-slots-level-${slot.level}`} className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14">
                  Level {slot.level}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: slot.total }, (_, i) => (
                    <span
                      key={i}
                      data-testid={i < slot.used ? 'slot-filled' : 'slot-empty'}
                      className={`inline-block w-3 h-3 rotate-45 ${
                        i < slot.used
                          ? 'bg-indigo-600 dark:bg-indigo-400'
                          : 'border border-gray-400 dark:border-gray-500'
                      }`}
                    />
                  ))}
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
          <div className="space-y-1">
            {knownSpells.map((spell) => (
              <div key={spell} className="text-sm text-gray-700 dark:text-gray-300 py-0.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                {spell}
              </div>
            ))}
            {preparedSpells.map((spell) => (
              <div key={spell} className="text-sm text-gray-700 dark:text-gray-300 py-0.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                {spell}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
