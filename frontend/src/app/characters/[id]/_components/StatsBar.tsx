import type { Character } from '@/lib/types';
import {
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  passivePerception,
} from './utils';

interface StatsBarProps {
  character: Character;
}

export default function StatsBar({ character }: StatsBarProps) {
  const profBonus = proficiencyBonus(character.level);
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  const isPerceptionProficient = character.skills.includes('Perception');
  const passivePerc = passivePerception(
    character.abilityScores.wisdom,
    character.level,
    isPerceptionProficient,
  );

  const stats: { label: string; value: string; testId: string }[] = [
    { label: 'Prof. Bonus', value: formatModifier(profBonus), testId: 'stat-prof-bonus' },
    { label: 'Initiative', value: formatModifier(dexMod), testId: 'stat-initiative' },
    { label: 'Speed', value: `${character.speed} ft`, testId: 'stat-speed' },
    { label: 'Size', value: character.size ?? 'Medium', testId: 'stat-size' },
    { label: 'Passive Perception', value: `${passivePerc}`, testId: 'stat-passive-perception' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
      {stats.map(({ label, value, testId }) => (
        <div
          key={testId}
          data-testid={testId}
          className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            {label}
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
