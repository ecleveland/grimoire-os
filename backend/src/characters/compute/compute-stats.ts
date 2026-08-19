import type {
  CarryingCapacityRule,
  CharacterStatsInput,
  CharacterStatsRules,
  ClassSpellcasting,
  ComputedSpellSlots,
  ComputedStats,
  ExhaustionRule,
  InventoryItem,
  SpellcasterType,
  Weapon,
} from '@grimoire-os/shared';
import {
  abilityModifier,
  computeCoreCharacterStats,
  isKnownAbilityName,
  proficiencyBonusFrom,
} from '@grimoire-os/shared';
import { srdGameRules } from '../../seed/data/game-rules';

/**
 * Subset of a character's stored fields the compute layer reads. The shared
 * stat core defines the formulas and a deliberately tolerant input shape
 * (VEG-453); the service always reads a full Prisma row, so every field is
 * required here — a forgotten one is a compile error rather than a silently
 * defaulted derived value.
 *
 * `Required<…>` rather than re-listing the fields: it strips the optional
 * markers while leaving `| null` intact (so a genuinely nullable column stays
 * nullable), and — unlike hand-narrowing — a field added to
 * {@link CharacterStatsInput} later is required here automatically instead of
 * being silently inherited as optional.
 */
export interface CharacterComputeInput extends Required<CharacterStatsInput> {
  /** The character's own proficiency strings (weapon/tool, free text); unioned
   * with the class weapon proficiencies to resolve weapon grants (VEG-463). */
  proficiencies: string[];
  /** Inventory rows; equipped items with gear metadata drive AC/weapons (VEG-410). */
  inventory: InventoryItem[];
  /** Stored manual weapon rows; a same-named equipped weapon derives no duplicate. */
  weapons: Weapon[];
}

// ── Game-rules source (single source of truth, mirrors GET /srd/rules) ──
// The proficiency-bonus table, skill→ability mappings, XP thresholds and
// exhaustion scaling are read straight from the seeded `game_rules` data rather
// than hardcoded, so the compute layer can never drift from the rules API. The
// shared package keeps master copies of the same tables for consumers with no
// database access (builder previews, test fixtures); drift-guard tests in this
// module's spec pin the seeded rows to those copies.

function ruleValue(category: string, key: string): Record<string, unknown> {
  const rule = srdGameRules.find(r => r.category === category && r.key === key);
  if (!rule) {
    throw new Error(`Missing game rule "${category}/${key}"`);
  }
  return rule.value as Record<string, unknown>;
}

const SEEDED_RULES: CharacterStatsRules = {
  proficiencyBonusTable: ruleValue('proficiency-bonus', 'table') as Record<string, number>,
  skillAbilityMap: ruleValue('skills', 'ability-mappings') as Record<string, string>,
  xpThresholds: ruleValue('experience-points', 'level-thresholds') as Record<string, number>,
  exhaustion: ruleValue('exhaustion', 'levels') as unknown as ExhaustionRule,
  carryingCapacity: ruleValue('carrying-capacity', 'rules') as unknown as CarryingCapacityRule,
};

// ── Primitive formulas ─────────────────────────────────────────────────

/** Levels outside 1–20 clamp to the nearest valid level for table lookups. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(20, Math.max(1, Math.floor(level)));
}

// The canonical 5e formulas live in @grimoire-os/shared next to the gear
// derivations they feed; re-exported so existing consumers keep working.
export { abilityModifier, isKnownAbilityName };

/** Proficiency bonus from the seeded rules table (ceil(level/4)+1), clamped 1–20. */
export function proficiencyBonus(level: number): number {
  return proficiencyBonusFrom(SEEDED_RULES.proficiencyBonusTable, level);
}

// The former `computeExhaustion` / `computeXp` wrappers are gone (VEG-453): the
// shared core derives both from the same `SEEDED_RULES` this module passes it,
// so the wrappers had no callers left. Anything needing one standalone should
// call `computeExhaustionEffect` / `computeXpBand` with `SEEDED_RULES` directly.

// ── Spell slots ────────────────────────────────────────────────────────

/**
 * A class's standard spell-slot progression spans levels 1–20; full casters
 * reach 9th-level slots by level 17, half casters top out at 5th. We read the
 * progression's own level-20 row to label the caster rather than hardcoding a
 * class list.
 */
function casterTypeFromProgression(
  progression: Record<number, Record<number, number>>
): Exclude<SpellcasterType, 'pact'> {
  const topRow = progression[20] ?? {};
  const highestSlotLevel = Math.max(0, ...Object.keys(topRow).map(Number));
  return highestSlotLevel >= 9 ? 'full' : 'half';
}

function resolveSpellSlots(
  level: number,
  spellcasting: ClassSpellcasting | null | undefined
): ComputedSpellSlots | null {
  if (!spellcasting) return null;
  const lvl = clampLevel(level);

  if (spellcasting.pactMagic && spellcasting.pactSlotProgression) {
    const entry = spellcasting.pactSlotProgression[lvl];
    const maxByLevel: Record<number, number> = {};
    if (entry && entry.slots > 0) {
      maxByLevel[entry.slotLevel] = entry.slots;
    }
    return { caster: 'pact', maxByLevel };
  }

  if (spellcasting.spellSlotProgression) {
    const row = spellcasting.spellSlotProgression[lvl] ?? {};
    const maxByLevel: Record<number, number> = {};
    for (const [slotLevel, count] of Object.entries(row)) {
      maxByLevel[Number(slotLevel)] = count;
    }
    return { caster: casterTypeFromProgression(spellcasting.spellSlotProgression), maxByLevel };
  }

  return null;
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Derive a character's authoritative stats from its stored inputs. Pure: the
 * same inputs always yield the same block, so editing an ability score changes
 * every dependent value with no separate write (VEG-346).
 *
 * The formulas themselves live in `@grimoire-os/shared` so the builder previews
 * and test fixtures compute identically (VEG-453); this layer supplies the
 * seeded rules tables and the one derivation needing the class catalog.
 */
export function computeCharacterStats(
  character: CharacterComputeInput,
  classSpellcasting?: ClassSpellcasting | null,
  // Class-catalog data resolved by the service, like classSpellcasting; the
  // union with the character's own list happens in the shared core so the
  // grant semantics stay with the formulas (VEG-463).
  classWeaponProficiencies: string[] = []
): ComputedStats {
  return {
    ...computeCoreCharacterStats(SEEDED_RULES, character, {
      defaultSpellcastingAbility: classSpellcasting?.ability,
      weaponProficiencies: classWeaponProficiencies,
    }),
    // The only derivation the shared core can't do: it needs the class
    // catalog's slot progression, which no frontend consumer has.
    spellSlots: resolveSpellSlots(character.level, classSpellcasting),
  };
}
