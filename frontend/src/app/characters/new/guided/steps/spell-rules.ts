import type { AbilityScores } from '@/lib/types';
import { abilityKeyFromName } from '@grimoire-os/shared';
import { abilityModifier } from '@/lib/ability-math';

// `toSpellEntry` and the class spell-budget rules live in the shared lib so the
// character sheet (VEG-404/405) and the guided builder use one implementation.
// Re-exported here for back-compat with existing builder imports.
export {
  toSpellEntry,
  cantripCount,
  leveledSpellAllowance,
  spellPreparationSummary,
} from '@/lib/character-spells';
export type { SpellMode, SpellCategorySummary } from '@/lib/character-spells';

/**
 * Modifier for the ability identified by its full name (e.g. "Intelligence"),
 * or 0 when the name isn't one of the six — the same degradation the API applies
 * to a corrupt `spellcastingAbility`. Resolves via the shared
 * {@link abilityKeyFromName} rather than a local reverse scan, so the builder's
 * preview and the server's save DC can't disagree on what a name resolves to
 * (VEG-453).
 */
export function abilityModForName(scores: AbilityScores, abilityName: string): number {
  const key = abilityKeyFromName(abilityName);
  return key ? abilityModifier(scores[key]) : 0;
}
