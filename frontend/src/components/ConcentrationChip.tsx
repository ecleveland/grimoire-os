'use client';

import type { CombatantConcentration } from '@/lib/types';

/**
 * The amber concentration pill (VEG-287), shared by the encounter tracker and
 * the character sheet's status tracker (VEG-408) so the two surfaces can't
 * drift. The caller decides *whether* to render it (the object's presence is
 * what means "concentrating"); this only decides how it looks.
 */
export default function ConcentrationChip({
  concentration,
}: {
  concentration: CombatantConcentration;
}) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded"
      title="Concentration"
    >
      Concentrating{concentration.spell ? `: ${concentration.spell}` : ''}
    </span>
  );
}
