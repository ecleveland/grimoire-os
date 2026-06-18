import type { ClassSpellcasting, SpellEntry, SrdSpell } from '@/lib/types';

/**
 * Pure helpers for the sheet's spell management (VEG-404), the catalog →
 * sheet-entry mapper, and the class spell-budget rules (VEG-405) — all shared
 * between the live character sheet and the guided builder, which imports them
 * via the back-compat re-exports in `guided/steps/spell-rules.ts`. Mirrors
 * `character-inventory.ts` / `character-attunement.ts`.
 */

/** True when the components string lists a material (M) component. */
function hasMaterial(spell: SrdSpell): boolean {
  if (spell.material) return true;
  return spell.components.split(/[\s,]+/).includes('M');
}

/**
 * Build a sheet `SpellEntry` from a catalog `SrdSpell`, copying the C·R·M /
 * casting-time / range metadata and linking `spellId`. Leveled spells are written
 * `prepared: true` (a known caster's repertoire and a prepared caster's prepared
 * set are both castable); cantrips are `prepared: false` (always available — the
 * sheet renders level 0 as "—" regardless).
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

/** Append a spell entry, returning a new array (never mutates the input). */
export function addSpellEntry(spells: SpellEntry[], entry: SpellEntry): SpellEntry[] {
  return [...spells, entry];
}

/** Remove the entry at `index`; an out-of-range index is a no-op (new array). */
export function removeSpellEntryAt(spells: SpellEntry[], index: number): SpellEntry[] {
  return spells.filter((_, i) => i !== index);
}

/** Flip the `prepared` flag of the entry at `index` (absent counts as false). */
export function togglePreparedAt(spells: SpellEntry[], index: number): SpellEntry[] {
  return spells.map((s, i) => (i === index ? { ...s, prepared: !s.prepared } : s));
}

/** How a class gets its leveled spells: a fixed known list vs a prepared count. */
export type SpellMode = 'known' | 'prepared';

/** Cantrips known at `level` for this class (0 if the class has none). */
export function cantripCount(sc: ClassSpellcasting, level: number): number {
  return sc.cantripsKnown?.[level] ?? 0;
}

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

/** Current-vs-allowed for one spell category, plus a non-blocking over-limit flag. */
export interface SpellCategorySummary {
  count: number;
  allowed: number;
  over: boolean;
}

/**
 * Surface a character's spell budget on the live sheet (VEG-405): how many
 * cantrips and leveled spells they hold versus what their class allows. Cantrips
 * count by their level-0 entries; leveled spells count by *prepared* entries for
 * prepared casters (Cleric/Druid/Paladin/Wizard) and by the full known list for
 * known casters (Bard/Ranger/Sorcerer/Warlock), matching how each class's budget
 * is defined. `over` is advisory only — nothing here blocks the player.
 */
export function spellPreparationSummary(
  sc: ClassSpellcasting,
  level: number,
  abilityMod: number,
  spells: SpellEntry[]
): {
  cantrips: SpellCategorySummary;
  leveled: SpellCategorySummary & { mode: SpellMode };
} {
  const cantripsAllowed = cantripCount(sc, level);
  const cantripsHeld = spells.filter(s => s.level === 0).length;

  const leveled = leveledSpellAllowance(sc, level, abilityMod);
  const leveledHeld = spells.filter(
    s => s.level > 0 && (leveled.mode === 'prepared' ? s.prepared : true)
  ).length;

  return {
    cantrips: {
      count: cantripsHeld,
      allowed: cantripsAllowed,
      over: cantripsHeld > cantripsAllowed,
    },
    leveled: {
      count: leveledHeld,
      allowed: leveled.count,
      mode: leveled.mode,
      over: leveledHeld > leveled.count,
    },
  };
}
