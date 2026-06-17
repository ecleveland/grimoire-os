import type { AbilityScores, ClassSpellcasting } from '@/lib/types';
import { ABILITY_KEY_TO_NAME, abilityModifier } from '@/lib/ability-math';

// `toSpellEntry` now lives in the shared lib so the character sheet (VEG-404)
// and the guided builder use one catalog → SpellEntry mapper. Re-exported here
// for back-compat with existing builder imports.
export { toSpellEntry } from '@/lib/character-spells';

/** Modifier for the ability identified by its full name (e.g. "Intelligence"). */
export function abilityModForName(scores: AbilityScores, abilityName: string): number {
  const entry = Object.entries(ABILITY_KEY_TO_NAME).find(([, name]) => name === abilityName);
  if (!entry) return 0;
  return abilityModifier(scores[entry[0] as keyof AbilityScores]);
}

/** Cantrips known at `level` for this class (0 if the class has none). */
export function cantripCount(sc: ClassSpellcasting, level: number): number {
  return sc.cantripsKnown?.[level] ?? 0;
}

/** How a class gets its leveled spells: a fixed known list vs a prepared count. */
export type SpellMode = 'known' | 'prepared';

/** Does the class have any spell slots at this level per its progression table? */
function castsAtLevel(sc: ClassSpellcasting, level: number): boolean {
  // Absent progression data → assume it casts (don't zero out a caster we lack
  // slot data for); present-but-empty (half-casters at level 1) → it does not.
  if (!sc.spellSlotProgression) return true;
  return Object.keys(sc.spellSlotProgression[level] ?? {}).length > 0;
}

/**
 * Leveled-spell allowance at `level`. Known casters (Bard/Ranger/Sorcerer/
 * Warlock) read the spells-known table verbatim; prepared casters (Cleric/Druid/
 * Paladin/Wizard) evaluate `preparedFormula` (`level [/ 2] + <ability> modifier`)
 * with the spellcasting-ability `abilityMod`, clamped to a minimum of 1 — but only
 * once the class actually casts. A half-caster with no slots yet (e.g. a level-1
 * Paladin) prepares 0, since the min-1 clamp must not invent spells for a class
 * that can't cast at this level.
 */
export function leveledSpellAllowance(
  sc: ClassSpellcasting,
  level: number,
  abilityMod: number
): { count: number; mode: SpellMode } {
  if (sc.spellsKnown) {
    return { count: sc.spellsKnown[level] ?? 0, mode: 'known' };
  }
  if (sc.preparedFormula) {
    if (!castsAtLevel(sc, level)) return { count: 0, mode: 'prepared' };
    const levelTerm = /level\s*\/\s*2/i.test(sc.preparedFormula) ? Math.floor(level / 2) : level;
    return { count: Math.max(1, levelTerm + abilityMod), mode: 'prepared' };
  }
  return { count: 0, mode: 'known' };
}
