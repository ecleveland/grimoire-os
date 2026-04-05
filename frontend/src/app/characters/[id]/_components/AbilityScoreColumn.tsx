import type { Character } from '@/lib/types';
import {
  abilityModifier,
  formatModifier,
  skillBonus,
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_KEY_TO_NAME,
  ABILITY_SKILLS_MAP,
} from './utils';

interface AbilityScoreColumnProps {
  character: Character;
}

function toTestId(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

export default function AbilityScoreColumn({ character }: AbilityScoreColumnProps) {
  return (
    <div className="flex flex-col gap-4">
      {ABILITY_KEYS.map((key) => {
        const score = character.abilityScores[key];
        const mod = abilityModifier(score);
        const abilityName = ABILITY_KEY_TO_NAME[key];
        const skills = ABILITY_SKILLS_MAP[abilityName] ?? [];
        const isSaveProficient = character.savingThrows.includes(abilityName);
        const saveBonus = skillBonus(score, character.level, isSaveProficient);

        return (
          <div
            key={key}
            data-testid={`ability-card-${key}`}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <h3 className="text-xs font-bold text-center uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {ABILITY_LABELS[key]}
            </h3>

            <div
              data-testid={`modifier-${key}`}
              className="text-3xl font-bold text-center text-gray-900 dark:text-white"
            >
              {formatModifier(mod)}
            </div>

            <div
              data-testid={`score-${key}`}
              className="text-sm text-center text-gray-500 dark:text-gray-400"
            >
              ({score})
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

            <div
              data-testid={`save-row-${key}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                data-testid={`save-dot-${key}`}
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  isSaveProficient
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
              <span className="text-gray-700 dark:text-gray-300 flex-1">Saving Throw</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatModifier(saveBonus)}
              </span>
            </div>

            {skills.map((skillName) => {
              const isSkillProficient = character.skills.includes(skillName);
              const bonus = skillBonus(score, character.level, isSkillProficient);
              return (
                <div
                  key={skillName}
                  data-testid={`skill-row-${toTestId(skillName)}`}
                  className="flex items-center gap-2 text-sm mt-1"
                >
                  <span
                    data-testid={`skill-dot-${toTestId(skillName)}`}
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      isSkillProficient
                        ? 'bg-indigo-600 dark:bg-indigo-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                  <span className="text-gray-700 dark:text-gray-300 flex-1">{skillName}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatModifier(bonus)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
