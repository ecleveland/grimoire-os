'use client';

import type { Character } from '@/lib/types';
import { DEFAULT_ABILITY_SCORES, DEFAULT_SPEED } from '@/lib/character-defaults';
import { abilityModifier, formatModifier, proficiencyBonus, passivePerception } from './utils';
import { useDiceRoll } from './useDiceRoll';
import RollableStat from './RollableStat';

interface StatsBarProps {
  character: Character;
  /** When true, Initiative becomes a roll button (owner-only). */
  canRoll?: boolean;
}

export default function StatsBar({ character, canRoll }: StatsBarProps) {
  const { rollCheck } = useDiceRoll();
  // abilityScores/speed are nullable at the API boundary (VEG-425); fall back
  // to neutral display values so a minimal character renders instead of crashing.
  const abilityScores = character.abilityScores ?? DEFAULT_ABILITY_SCORES;
  const profBonus = proficiencyBonus(character.level);
  const dexMod = abilityModifier(abilityScores.dexterity);
  const isPerceptionProficient = character.skills.includes('Perception');
  const passivePerc = passivePerception(
    abilityScores.wisdom,
    character.level,
    isPerceptionProficient
  );

  const stats: { label: string; value: string; testId: string }[] = [
    { label: 'Prof. Bonus', value: formatModifier(profBonus), testId: 'stat-prof-bonus' },
    { label: 'Initiative', value: formatModifier(dexMod), testId: 'stat-initiative' },
    { label: 'Speed', value: `${character.speed ?? DEFAULT_SPEED} ft`, testId: 'stat-speed' },
    { label: 'Size', value: character.size ?? 'Medium', testId: 'stat-size' },
    { label: 'Passive Perception', value: `${passivePerc}`, testId: 'stat-passive-perception' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
      {stats.map(({ label, value, testId }) => {
        const rollable = canRoll && testId === 'stat-initiative';
        return (
          <div
            key={testId}
            data-testid={testId}
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
          >
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              {label}
            </div>
            <RollableStat
              canRoll={rollable}
              label="Roll initiative"
              onRoll={() => rollCheck('Initiative', dexMod)}
              className="block w-full text-center text-xl font-bold text-gray-900 dark:text-white mt-1"
            >
              {value}
            </RollableStat>
          </div>
        );
      })}
    </div>
  );
}
