'use client';

import type { Character } from '@/lib/types';
import type { ComputedSpeed } from '@grimoire-os/shared';
import { DEFAULT_SPEED } from '@/lib/character-defaults';
import { formatModifier } from './utils';
import { useDiceRoll } from './useDiceRoll';
import RollableStat from './RollableStat';

interface StatsBarProps {
  character: Character;
  /** When true, Initiative becomes a roll button (owner-only). */
  canRoll?: boolean;
}

/**
 * Speed readout: the computed block's effective value, annotating the reduction
 * so a lowered speed reads as a penalty rather than bad data. Falls back to the
 * stored column when the computed block predates `speed` (version skew).
 */
function speedLabel(speed: ComputedSpeed | undefined, storedSpeed: number | null): string {
  if (!speed) return `${storedSpeed ?? DEFAULT_SPEED} ft`;
  return speed.penalty > 0 ? `${speed.effective} ft (−${speed.penalty})` : `${speed.base} ft`;
}

export default function StatsBar({ character, canRoll }: StatsBarProps) {
  const { rollCheck } = useDiceRoll();
  // Derived stats come from the server-computed block — the single source of
  // truth (VEG-412). Initiative deliberately ignores the stored
  // `character.initiative` column: computed (the Dex modifier, less any
  // exhaustion penalty) wins on the sheet. Speed likewise reads the computed
  // block rather than the stored column, so an exhaustion reduction shows here
  // (VEG-449) — the block applies the no-stored-speed fallback server-side.
  // Size is stored, not derived; nullable at the API boundary (VEG-425).
  const { proficiencyBonus, initiative, passivePerception } = character.computed;
  // `speed` can be absent under version skew (a payload from a pre-VEG-449
  // backend) — degrade to the legacy stored-speed render instead of crashing
  // the whole sheet, the same contract CombatBar's derived AC follows.
  const speed: ComputedSpeed | undefined = character.computed.speed;

  const stats: { label: string; value: string; testId: string }[] = [
    { label: 'Prof. Bonus', value: formatModifier(proficiencyBonus), testId: 'stat-prof-bonus' },
    { label: 'Initiative', value: formatModifier(initiative), testId: 'stat-initiative' },
    {
      label: 'Speed',
      // Show the reduction rather than only its result, so a lowered speed is
      // self-explaining instead of looking like bad data.
      value: speedLabel(speed, character.speed),
      testId: 'stat-speed',
    },
    { label: 'Size', value: character.size ?? 'Medium', testId: 'stat-size' },
    {
      label: 'Passive Perception',
      value: `${passivePerception}`,
      testId: 'stat-passive-perception',
    },
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
              onRoll={() => rollCheck('Initiative', initiative)}
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
