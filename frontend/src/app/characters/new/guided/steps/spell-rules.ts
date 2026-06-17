import type { AbilityScores, ClassSpellcasting, SpellEntry, SrdSpell } from '@/lib/types';
import { ABILITY_KEY_TO_NAME, abilityModifier } from '@/lib/ability-math';

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

/**
 * Leveled-spell allowance at `level`. Known casters (Bard/Ranger/Sorcerer/
 * Warlock) read the spells-known table verbatim; prepared casters (Cleric/Druid/
 * Paladin/Wizard) evaluate `preparedFormula` (`level [/ 2] + <ability> modifier`)
 * with the spellcasting-ability `abilityMod`, clamped to a minimum of 1.
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
    const levelTerm = /level\s*\/\s*2/i.test(sc.preparedFormula) ? Math.floor(level / 2) : level;
    return { count: Math.max(1, levelTerm + abilityMod), mode: 'prepared' };
  }
  return { count: 0, mode: 'known' };
}

/** Highest spell level a full caster can cast at `level` (ceil(level/2), max 9). */
export function maxSpellLevel(level: number): number {
  return Math.min(9, Math.ceil(level / 2));
}

/** True when the components string lists a material (M) component. */
function hasMaterial(spell: SrdSpell): boolean {
  if (spell.material) return true;
  return spell.components.split(/[\s,]+/).includes('M');
}

/**
 * Build a sheet `SpellEntry` from a catalog `SrdSpell`, copying the C·R·M /
 * casting-time / range metadata and linking `spellId`. Leveled spells are written
 * `prepared: true` (a known caster's repertoire and a prepared caster's prepared
 * set are both castable at creation); cantrips are `prepared: false` (always
 * available — the sheet renders level 0 as "—" regardless).
 */
export function toSpellEntry(spell: SrdSpell): SpellEntry {
  return {
    level: spell.level,
    name: spell.name,
    prepared: spell.level > 0,
    castingTime: spell.castingTime,
    range: spell.range,
    concentration: spell.concentration,
    ritual: spell.ritual,
    material: hasMaterial(spell),
    spellId: spell.id,
  };
}
