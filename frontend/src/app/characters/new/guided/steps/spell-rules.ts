import type { AbilityScores } from '@/lib/types';
import { ABILITY_KEY_TO_NAME, abilityModifier } from '@/lib/ability-math';

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

/** Modifier for the ability identified by its full name (e.g. "Intelligence"). */
export function abilityModForName(scores: AbilityScores, abilityName: string): number {
  const entry = Object.entries(ABILITY_KEY_TO_NAME).find(([, name]) => name === abilityName);
  if (!entry) return 0;
  return abilityModifier(scores[entry[0] as keyof AbilityScores]);
}
