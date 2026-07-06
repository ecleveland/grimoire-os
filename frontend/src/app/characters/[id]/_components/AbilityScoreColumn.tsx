'use client';

import type { Character } from '@/lib/types';
import { DEFAULT_ABILITY_SCORES } from '@/lib/character-defaults';
import {
  formatModifier,
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_KEY_TO_NAME,
  ABILITY_SKILLS_MAP,
} from './utils';
import { useDiceRoll } from './useDiceRoll';
import RollableStat from './RollableStat';

interface AbilityScoreColumnProps {
  character: Character;
  /** When true, modifiers become roll buttons (owner-only at-the-table rolls). */
  canRoll?: boolean;
}

function toTestId(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

export default function AbilityScoreColumn({ character, canRoll }: AbilityScoreColumnProps) {
  const { rollCheck } = useDiceRoll();
  // Modifiers, saves and skills read the server-computed block — the single
  // source of truth (VEG-412). Only the raw (score) display stays on the stored
  // abilityScores, which are nullable at the API boundary (VEG-425) and fall
  // back to a neutral all-10 spread.
  const { computed } = character;
  const abilityScores = character.abilityScores ?? DEFAULT_ABILITY_SCORES;

  return (
    <div className="flex flex-col gap-4">
      {ABILITY_KEYS.map(key => {
        const score = abilityScores[key];
        const mod = computed.abilityModifiers[key];
        const abilityName = ABILITY_KEY_TO_NAME[key];
        const skills = ABILITY_SKILLS_MAP[abilityName] ?? [];
        // Neutral fallbacks guard a key mismatch between the frontend ability/
        // skill name lists and the backend game-rules keys — fail soft, not crash.
        const save = computed.savingThrows[abilityName] ?? { proficient: false, bonus: mod };
        const isSaveProficient = save.proficient;
        const saveBonus = save.bonus;

        return (
          <div
            key={key}
            data-testid={`ability-card-${key}`}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <h3 className="text-xs font-bold text-center uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {ABILITY_LABELS[key]}
            </h3>

            <RollableStat
              canRoll={canRoll}
              testId={`modifier-${key}`}
              label={`Roll ${abilityName} check`}
              onRoll={() => rollCheck(`${abilityName} check`, mod)}
              className="block w-full text-3xl font-bold text-center text-gray-900 dark:text-white"
            >
              {formatModifier(mod)}
            </RollableStat>

            <div
              data-testid={`score-${key}`}
              className="text-sm text-center text-gray-500 dark:text-gray-400"
            >
              ({score})
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

            <div data-testid={`save-row-${key}`} className="flex items-center gap-2 text-sm">
              <span
                data-testid={`save-dot-${key}`}
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  isSaveProficient
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
              <span className="text-gray-700 dark:text-gray-300 flex-1">Saving Throw</span>
              <RollableStat
                canRoll={canRoll}
                label={`Roll ${abilityName} save`}
                onRoll={() => rollCheck(`${abilityName} save`, saveBonus)}
                className="font-medium text-gray-900 dark:text-white"
              >
                {formatModifier(saveBonus)}
              </RollableStat>
            </div>

            {skills.map(skillName => {
              const skill = computed.skills[skillName] ?? { proficient: false, bonus: mod };
              const isSkillProficient = skill.proficient;
              const bonus = skill.bonus;
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
                  <RollableStat
                    canRoll={canRoll}
                    label={`Roll ${skillName}`}
                    onRoll={() => rollCheck(`${skillName} check`, bonus)}
                    className="font-medium text-gray-900 dark:text-white"
                  >
                    {formatModifier(bonus)}
                  </RollableStat>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
