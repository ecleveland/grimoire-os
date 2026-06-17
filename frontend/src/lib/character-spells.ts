import type { SpellEntry, SrdSpell } from '@/lib/types';

/**
 * Pure helpers for the sheet's spell management (VEG-404), plus the catalog →
 * sheet-entry mapper shared with the guided builder (`toSpellEntry`, which lived
 * in `guided/steps/spell-rules.ts` and is re-exported there for back-compat).
 * Mirrors `character-inventory.ts` / `character-attunement.ts`.
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
