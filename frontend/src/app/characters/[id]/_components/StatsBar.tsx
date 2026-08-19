'use client';

import type { Character } from '@/lib/types';
import type { ComputedInitiative, ComputedSpeed } from '@grimoire-os/shared';
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

/**
 * Which reductions produced the total (VEG-490); empty when nothing is reducing
 * speed. Kept off the value line deliberately: that renders at text-xl in a
 * narrow grid tile, so naming the sources inline would wrap badly. This is the
 * same split CombatBar uses for its derived-AC breakdown.
 *
 * Each contributing source is named — "−15" alone doesn't tell a player whether
 * to drop cargo or take a long rest. A source contributing 0 is omitted rather
 * than listed as "−0".
 */
function speedBreakdown(speed: ComputedSpeed | undefined): string[] {
  if (!speed || speed.penalty <= 0) return [];
  // A pre-VEG-490 computed block has `penalty` but neither component field;
  // attributing the whole total to a source we can't verify would be a guess, so
  // degrade to no breakdown rather than a wrong one.
  const parts: string[] = [];
  if (speed.exhaustionPenalty > 0) parts.push(`−${speed.exhaustionPenalty} exhaustion`);
  // "encumbered", not "encumbrance": same length as "exhaustion" so both fit the
  // tile on one line at mobile width, and it echoes the tier word the inventory
  // panel already shows rather than introducing a second term for one rule.
  if (speed.encumbrancePenalty > 0) parts.push(`−${speed.encumbrancePenalty} encumbered`);
  return parts;
}

/**
 * Initiative from the computed block (VEG-452). A pre-VEG-452 backend sends a
 * bare number where the block now sits, so that shape degrades to itself.
 *
 * The `undefined` arm is NOT version skew: `initiative` has been on
 * `ComputedStats` since its first commit, so a backend old enough to omit it
 * omits the whole `computed` object and the property access throws first. It is
 * kept only as a malformed-payload guard, so a bad block renders a 0 instead of
 * "+undefined".
 */
function initiativeValue(initiative: ComputedInitiative | number | undefined): number {
  if (typeof initiative === 'number') return initiative;
  return initiative?.effective ?? 0;
}

/**
 * Which sources produced the initiative total (VEG-452); empty when the
 * Dexterity modifier is the only contribution, so an ordinary character gets no
 * redundant "+1 dex" line under a "+1" value.
 *
 * Same split as {@link speedBreakdown} for the same reason: the value renders at
 * text-xl in a narrow tile, so naming sources inline would wrap. A legacy numeric
 * initiative has no parts to name and yields nothing.
 */
function initiativeBreakdown(initiative: ComputedInitiative | number | undefined): string[] {
  if (typeof initiative !== 'object' || initiative === null) return [];
  const { base, bonus, exhaustionPenalty } = initiative;
  if (bonus === 0 && exhaustionPenalty === 0) return [];
  const parts = [`${formatModifier(base)} dex`];
  if (bonus !== 0) parts.push(`${formatModifier(bonus)} bonus`);
  // Magnitude with an explicit minus, matching speedBreakdown above rather than
  // formatModifier — the two tiles sit side by side and must not disagree on
  // how a reduction looks.
  if (exhaustionPenalty > 0) parts.push(`−${exhaustionPenalty} exhaustion`);
  return parts;
}

export default function StatsBar({ character, canRoll }: StatsBarProps) {
  const { rollCheck } = useDiceRoll();
  // Derived stats come from the server-computed block — the single source of
  // truth (VEG-412). Initiative no longer ignores the stored
  // `character.initiative` column as it did before VEG-452: the block now folds
  // that column in as an additive bonus over the Dex modifier, so the sheet and
  // the encounter roster quote one number. Speed likewise reads the computed
  // block rather than the stored column, so an exhaustion reduction shows here
  // (VEG-449) — the block applies the no-stored-speed fallback server-side.
  // Size is stored, not derived; nullable at the API boundary (VEG-425).
  const { proficiencyBonus, passivePerception } = character.computed;
  // Like `speed` below, this can be a bare number under version skew (a payload
  // from a pre-VEG-452 backend), so it is read defensively.
  const initiative: ComputedInitiative | number | undefined = character.computed.initiative;
  const initiativeTotal = initiativeValue(initiative);
  // `speed` can be absent under version skew (a payload from a pre-VEG-449
  // backend) — degrade to the legacy stored-speed render instead of crashing
  // the whole sheet, the same contract CombatBar's derived AC follows.
  const speed: ComputedSpeed | undefined = character.computed.speed;

  const stats: {
    label: string;
    value: string;
    testId: string;
    /** Small lines naming what produced a reduction, one per source (VEG-490). */
    breakdown?: { lines: string[]; testId: string };
  }[] = [
    { label: 'Prof. Bonus', value: formatModifier(proficiencyBonus), testId: 'stat-prof-bonus' },
    {
      label: 'Initiative',
      value: formatModifier(initiativeTotal),
      testId: 'stat-initiative',
      breakdown: { lines: initiativeBreakdown(initiative), testId: 'initiative-breakdown' },
    },
    {
      label: 'Speed',
      // Show the reduction rather than only its result, so a lowered speed is
      // self-explaining instead of looking like bad data.
      value: speedLabel(speed, character.speed),
      testId: 'stat-speed',
      breakdown: { lines: speedBreakdown(speed), testId: 'speed-breakdown' },
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
      {stats.map(({ label, value, testId, breakdown }) => {
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
              onRoll={() => rollCheck('Initiative', initiativeTotal)}
              className="block w-full text-center text-xl font-bold text-gray-900 dark:text-white mt-1"
            >
              {value}
            </RollableStat>
            {breakdown && breakdown.lines.length > 0 && (
              <div
                data-testid={breakdown.testId}
                className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight"
              >
                {/* One source per line, and each line unbreakable. Screenshotting
                    the real tile at mobile width (3 columns) showed both failure
                    modes: joined into a sentence they wrapped mid-phrase, and
                    even one per line "−10 encumbered" split its number onto its
                    own row, reading as a third mystery value. */}
                {breakdown.lines.map(line => (
                  <div key={line} className="whitespace-nowrap">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
