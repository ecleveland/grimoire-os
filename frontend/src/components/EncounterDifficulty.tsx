'use client';

import type { Combatant } from '@/lib/types';
import { summarizeEncounter, type DifficultyBand } from '@grimoire-os/shared';
import { formatCr } from '@/lib/srd-format';

// 2024 DMG bands plus the over-budget "Deadly" — green → red as it gets nastier.
const bandClass: Record<DifficultyBand, string> = {
  Low: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
  Moderate: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
  High: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
  Deadly: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
};

interface Props {
  combatants: Combatant[];
  className?: string;
}

/**
 * Encounter-difficulty readout (VEG-362): monster count, total monster XP,
 * summed CR, and the 2024 DMG difficulty band. PCs are excluded from the
 * monster totals; the band is derived from the PC levels in the encounter and
 * only shown once at least one PC carries a level (otherwise a prompt to add
 * the party). All math lives in the shared `summarizeEncounter` helper so this
 * is presentation only.
 */
export default function EncounterDifficulty({ combatants, className }: Props) {
  const { monsterCount, totalXp, summedCr, band, partyCount, actionEconomyWarning } =
    summarizeEncounter(combatants);

  const wrapClass = ['flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className]
    .filter(Boolean)
    .join(' ');

  if (monsterCount === 0) {
    return (
      <div data-testid="encounter-difficulty" className={wrapClass}>
        <span className="text-gray-500 dark:text-gray-400">No monsters yet.</span>
      </div>
    );
  }

  return (
    <div data-testid="encounter-difficulty" className={wrapClass}>
      <span className="text-gray-700 dark:text-gray-300">
        {monsterCount} monster{monsterCount === 1 ? '' : 's'}
      </span>
      <span className="text-gray-400" aria-hidden="true">
        &middot;
      </span>
      <span className="text-gray-700 dark:text-gray-300">{totalXp.toLocaleString('en-US')} XP</span>
      <span className="text-gray-400" aria-hidden="true">
        &middot;
      </span>
      <span className="text-gray-700 dark:text-gray-300">CR {formatCr(summedCr)}</span>
      {band ? (
        <span
          data-testid="difficulty-band"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${bandClass[band]}`}
        >
          {band}
        </span>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Add party PCs to rate difficulty
        </span>
      )}
      {actionEconomyWarning && (
        <span
          data-testid="action-economy-warning"
          title="The 2024 XP band ignores how many monsters there are. With this many attackers per PC, action economy can make the fight far harder than the XP suggests."
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        >
          ⚠ {monsterCount} vs {partyCount} PC{partyCount === 1 ? '' : 's'} · action economy
        </span>
      )}
    </div>
  );
}
