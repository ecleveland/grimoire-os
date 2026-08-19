// ── Computed character stats (VEG-346) ─────────────────────────────────
//
// The backend derives these from a character's stored fields (ability scores,
// level, proficiencies, class spellcasting) on every read, so they can never
// drift from the inputs the way the persisted `initiative`/`spellSaveDC`/
// `spellAttackBonus` columns did. The display sheet consumes this block instead
// of recomputing locally. Formulas mirror the M10 `game_rules` source.

import type { AbilityScores, ArmorType, InventoryItem, Weapon } from './embedded';

/** Per-ability modifiers, keyed exactly like {@link AbilityScores}. */
export type ComputedAbilityModifiers = Record<keyof AbilityScores, number>;

/** A single skill's derived bonus plus the inputs that produced it. */
export interface ComputedSkill {
  /** Governing ability, full name (e.g. "Dexterity"). */
  ability: string;
  /** Ability modifier + proficiency bonus when proficient. */
  bonus: number;
  proficient: boolean;
}

/** A single saving throw's derived bonus. */
export interface ComputedSave {
  /** Ability modifier + proficiency bonus when proficient. */
  bonus: number;
  proficient: boolean;
}

/** Caster category, which selects the slot-progression table. */
export type SpellcasterType = 'full' | 'half' | 'pact';

export interface ComputedSpellSlots {
  caster: SpellcasterType;
  /** Slot level → maximum slots available at the character's level. */
  maxByLevel: Record<number, number>;
}

/**
 * Derived spellcasting numbers, present as a unit only for casters. Grouping
 * the four fields makes the "all set or all absent" invariant unrepresentable
 * as four independent nulls (VEG-346).
 */
export interface ComputedSpellcasting {
  /** Resolved spellcasting ability, full name (e.g. "Wisdom"). */
  ability: string;
  /** Modifier of the spellcasting ability. */
  modifier: number;
  /** 8 + proficiency bonus + spellcasting modifier. */
  saveDC: number;
  /** Proficiency bonus + spellcasting modifier. */
  attackBonus: number;
}

/**
 * XP position within the current level's band, derived from the seeded
 * level-threshold table (VEG-411). Advisory only — leveling is never gated on
 * it, so milestone campaigns can level with XP untouched.
 */
export interface ComputedXp {
  /** XP required to have reached the current level. */
  currentLevelAt: number;
  /** XP required for the next level, or null at level 20. */
  nextLevelAt: number | null;
  /** XP earned past `currentLevelAt`, clamped to ≥ 0. */
  into: number;
  /** Band width (`nextLevelAt - currentLevelAt`), or null at level 20. */
  span: number | null;
  /** True when XP meets `nextLevelAt`; always false at level 20. */
  readyToLevel: boolean;
}

/**
 * Postgres int4 ceiling for stored `experiencePoints`: the write boundary (DTO
 * `@Max`) and the sheet's Award XP control both enforce this one constant.
 */
export const MAX_EXPERIENCE_POINTS = 2_147_483_647;

/**
 * SRD XP required to reach each level, keyed '1'–'20'. Master copy for the
 * frontend test fixtures; the seeded `experience-points/level-thresholds` rule
 * carries the same data and a backend drift-guard test pins the two together.
 */
export const XP_LEVEL_THRESHOLDS: Readonly<Record<string, number>> = {
  '1': 0,
  '2': 300,
  '3': 900,
  '4': 2700,
  '5': 6500,
  '6': 14000,
  '7': 23000,
  '8': 34000,
  '9': 48000,
  '10': 64000,
  '11': 85000,
  '12': 100000,
  '13': 120000,
  '14': 140000,
  '15': 165000,
  '16': 195000,
  '17': 225000,
  '18': 265000,
  '19': 305000,
  '20': 355000,
};

/**
 * Pure XP band math shared by the backend compute layer and test fixtures, so
 * the derivation exists once and only the threshold *data* is ever mirrored.
 * `thresholds` maps level (as a string key, '1'–'20') to the XP required to
 * reach it and must cover that full range; out-of-range levels clamp to 1–20
 * like the other table lookups.
 */
export function computeXpBand(
  thresholds: Readonly<Partial<Record<string, number>>>,
  level: number,
  experiencePoints: number
): ComputedXp {
  const lvl = Number.isFinite(level) ? Math.min(20, Math.max(1, Math.floor(level))) : 1;
  const currentLevelAt = thresholds[String(lvl)];
  const nextLevelAt = lvl >= 20 ? null : thresholds[String(lvl + 1)];
  // A sparse table would otherwise surface as a silent NaN band downstream.
  if (currentLevelAt === undefined || nextLevelAt === undefined) {
    throw new Error(`XP threshold table is missing the level-${lvl} band`);
  }
  return {
    currentLevelAt,
    nextLevelAt,
    into: Math.max(0, experiencePoints - currentLevelAt),
    span: nextLevelAt === null ? null : nextLevelAt - currentLevelAt,
    readyToLevel: nextLevelAt !== null && experiencePoints >= nextLevelAt,
  };
}

/**
 * How the derived AC was assembled (VEG-410): the winning body armor's base
 * (or 10 unarmored), the Dex actually applied after the armor type's cap, and
 * the shield bonus. Lets the sheet render "13 + 2 Dex + 2 shield" without
 * re-deriving.
 */
export interface ComputedArmorClassBreakdown {
  base: number;
  dexApplied: number;
  shield: number;
  armorType: ArmorType | 'unarmored';
}

/**
 * Derived armor class (VEG-410). `derived` comes from equipped armor + shield
 * (+ Dex per armor type) and always exists (unarmored fallback = 10 + Dex);
 * `override` mirrors the stored `Character.armorClass` column, which wins when
 * set so homebrew/unarmored-defense builds keep working; `effective` is what
 * the sheet displays.
 */
export interface ComputedArmorClass {
  derived: number;
  override: number | null;
  effective: number;
  breakdown: ComputedArmorClassBreakdown;
}

/**
 * Default walking speed (ft) for a character with no stored `speed`. Mastered
 * here beside {@link resolveSpeed}, which applies it, so the computed block
 * never reports a null base. `frontend/src/lib/character-defaults` keeps a
 * local mirror — app code can't value-import this package under Turbopack — and
 * a frontend spec pins the two together.
 */
export const DEFAULT_SPEED = 30;

/**
 * Walking speed after derived penalties (VEG-449, VEG-490). `base` is the stored
 * column (or {@link DEFAULT_SPEED}) and `effective` is what the sheet displays —
 * floored at 0, since a creature never has negative speed.
 *
 * The two reductions are reported separately as well as totalled: a sheet that
 * only had the total couldn't tell the player *why* their speed dropped, and
 * before VEG-490 the encumbrance half was applied client-side by the inventory
 * panel alone, so the headline Speed stat silently omitted it.
 *
 * `penalty` is `exhaustionPenalty + encumbrancePenalty`, kept as its own field
 * so consumers wanting only the total don't have to know the breakdown.
 */
export interface ComputedSpeed {
  base: number;
  /** Feet lost to exhaustion (positive magnitude). */
  exhaustionPenalty: number;
  /** Feet lost to carrying weight (positive magnitude). */
  encumbrancePenalty: number;
  /** Total reduction in feet — the sum of the two above. */
  penalty: number;
  effective: number;
}

/**
 * Stored-vs-computed initiative reconciliation (VEG-452).
 *
 * Ownership rule: `base` is the Dexterity modifier and is owned by the compute
 * layer; `bonus` is the stored `Character.initiative` column, owned by the
 * player. The two ADD. The column is not an override — a stored 0 and an absent
 * column both mean "no bonus", so `effective` never drops below what Dexterity
 * alone would give.
 *
 * Additive rather than override-wins (which is how {@link ComputedArmorClass}
 * treats its stored column) for two reasons. The editor form has always
 * defaulted this field to 0, so override semantics would pin every
 * form-created character to +0 and silently mask their Dexterity. And the real
 * 5e sources of a flat initiative bonus — Alert, Jack of All Trades, a
 * Harengon's Hare-Trigger — genuinely stack on top of Dexterity rather than
 * replacing it, so an additive bonus keeps tracking Dexterity through
 * level-ups instead of going stale the moment the score changes.
 *
 * `exhaustionPenalty` is the d20-Test reduction, carried as its own field so a
 * sheet can name it rather than showing an unexplained drop. It is a POSITIVE
 * magnitude, matching every other `*Penalty` field on these types
 * ({@link ComputedSpeed.exhaustionPenalty}, {@link ComputedEncumbrance.speedPenalty}),
 * even though its source {@link ComputedExhaustion.d20Penalty} is negative. One
 * sign convention across all of them beats a field that means the opposite of
 * its identically-named sibling 40 lines up, which is the kind of thing a
 * reader gets wrong by analogy and no type can catch.
 */
export interface ComputedInitiative {
  /** Dexterity modifier — the derived half. */
  base: number;
  /** Stored `Character.initiative` column, added on top. 0 when unset. */
  bonus: number;
  /** d20-Test reduction from exhaustion, as a positive magnitude (e.g. 6). */
  exhaustionPenalty: number;
  /** `base + bonus - exhaustionPenalty`. Not floored — a negative initiative
   * modifier is a real outcome, unlike a negative speed. */
  effective: number;
}

/**
 * Resolve initiative from its three sources (VEG-452). See
 * {@link ComputedInitiative} for why the stored column adds rather than
 * overrides.
 */
export function resolveInitiative(
  stored: number | null | undefined,
  dexModifier: number,
  exhaustion: ComputedExhaustion | null
): ComputedInitiative {
  const bonus = stored ?? 0;
  // d20Penalty arrives negative; this type reports magnitudes, so negate once
  // here rather than letting the sign convention leak to every consumer.
  // Branch rather than negating a coalesced 0: `-(0)` is `-0`, which is a
  // distinct value to Object.is and to every deep-equality assertion.
  const exhaustionPenalty = exhaustion ? -exhaustion.d20Penalty : 0;
  return {
    base: dexModifier,
    bonus,
    exhaustionPenalty,
    effective: dexModifier + bonus - exhaustionPenalty,
  };
}

/** 5e variant encumbrance tiers, lightest to heaviest. */
export type EncumbranceTier = 'unencumbered' | 'encumbered' | 'heavily-encumbered';

/**
 * Derived carrying state (VEG-490). Moved here from the frontend's
 * `character-inventory` lib so the tier classification — which is rules data —
 * has one definition the sheet reads rather than deriving in parallel.
 */
export interface ComputedEncumbrance {
  tier: EncumbranceTier;
  /** Speed reduction in feet for this tier (0, 10, or 20). */
  speedPenalty: number;
  /** Heavily encumbered also imposes disadvantage on checks/attacks/STR-DEX-CON saves. */
  hasDisadvantage: boolean;
  /** Maximum carry weight in pounds: Strength × 15, size-scaled. */
  capacity: number;
  /** Total weight carried in pounds, rounded to two decimals. */
  carried: number;
}

/** The thresholds and multipliers the encumbrance derivation needs. */
export interface CarryingCapacityRule {
  /** Capacity = Strength × this, size-scaled (5e: 15). */
  capacityPerStrength: number;
  /** Encumbered above Strength × this, size-scaled (5e: 5). */
  encumberedPerStrength: number;
  /** Heavily encumbered above Strength × this, size-scaled (5e: 10). */
  heavilyEncumberedPerStrength: number;
  /** Feet of speed lost while encumbered (5e: 10). */
  encumberedSpeedPenalty: number;
  /** Feet of speed lost while heavily encumbered (5e: 20). */
  heavilyEncumberedSpeedPenalty: number;
  /** Creature size → capacity multiplier. Size is free text server-side, so an
   * unlisted value falls back to ×1 rather than being trusted as a key. */
  sizeMultipliers: Readonly<Record<string, number>>;
}

/**
 * SRD 5.2 carrying-capacity and variant-encumbrance numbers. Master copy for the
 * frontend test fixtures; the seeded `carrying-capacity/rules` row carries the
 * same values alongside its display prose, and a backend drift-guard test pins
 * the two together — the same arrangement as {@link EXHAUSTION_RULE}.
 */
export const CARRYING_CAPACITY_RULE: Readonly<CarryingCapacityRule> = {
  capacityPerStrength: 15,
  encumberedPerStrength: 5,
  heavilyEncumberedPerStrength: 10,
  encumberedSpeedPenalty: 10,
  heavilyEncumberedSpeedPenalty: 20,
  sizeMultipliers: {
    Tiny: 0.5,
    Small: 1,
    Medium: 1,
    Large: 2,
    Huge: 4,
    Gargantuan: 8,
  },
};

/** Round to two decimals so fractional weights don't show float drift. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classify carried weight into 5e's variant encumbrance tiers (VEG-490,
 * previously `encumbranceStatus` in the frontend lib): encumbered above
 * Strength × 5, heavily encumbered above Strength × 10 (+ disadvantage), each
 * threshold scaled by the creature's size multiplier — the same multiplier that
 * scales capacity.
 *
 * Comparisons are strictly greater-than, so a character carrying exactly the
 * threshold is still in the lighter tier. `size` is free text server-side; an
 * unknown or absent value falls back to the Medium (×1) multiplier rather than
 * indexing blind. A character with no ability scores reads as Strength 0 →
 * capacity 0, which would make every non-empty pack "heavily encumbered", so
 * callers pass a neutral score instead (see `computeCoreCharacterStats`).
 */
export function computeEncumbrance(
  rule: CarryingCapacityRule,
  strength: number,
  size: string | null | undefined,
  inventory: InventoryItem[]
): ComputedEncumbrance {
  const multiplier = (size && rule.sizeMultipliers[size]) || 1;
  const carried = round2(
    inventory.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0)
  );
  const heavyAt = strength * rule.heavilyEncumberedPerStrength * multiplier;
  const encumberedAt = strength * rule.encumberedPerStrength * multiplier;

  const tier: EncumbranceTier =
    carried > heavyAt
      ? 'heavily-encumbered'
      : carried > encumberedAt
        ? 'encumbered'
        : 'unencumbered';

  return {
    tier,
    speedPenalty:
      tier === 'heavily-encumbered'
        ? rule.heavilyEncumberedSpeedPenalty
        : tier === 'encumbered'
          ? rule.encumberedSpeedPenalty
          : 0,
    hasDisadvantage: tier === 'heavily-encumbered',
    capacity: strength * rule.capacityPerStrength * multiplier,
    carried,
  };
}

/**
 * Mechanical effect of the Exhaustion condition (VEG-449), present only while
 * the character is exhausted — `null` is "no exhaustion", so a consumer can't
 * mistake an inert level-0 block for an active penalty.
 *
 * SRD 5.2: a D20 Test is reduced by 2 × level and Speed by 5 ft × level; level
 * 6 is death. Derived from the seeded `exhaustion/levels` rule, not hardcoded.
 */
export interface ComputedExhaustion {
  /** Current level, 1–6 (a stored 0/null yields no block at all). */
  level: number;
  /** Reduction applied to every d20 Test, as a negative number (e.g. -6). */
  d20Penalty: number;
  /** Speed reduction in feet, as a positive magnitude (e.g. 15). */
  speedPenalty: number;
  /** Level 6 means death. Advisory only — nothing auto-kills the character. */
  dead: boolean;
}

/** The per-level scaling factors the exhaustion derivation needs. */
export interface ExhaustionRule {
  maxLevel: number;
  d20PenaltyPerLevel: number;
  speedPenaltyFeetPerLevel: number;
}

/**
 * SRD 5.2 exhaustion scaling. Master copy for the frontend test fixtures; the
 * seeded `exhaustion/levels` rule carries the same numbers and a backend
 * drift-guard test pins the two together — the same arrangement as
 * {@link XP_LEVEL_THRESHOLDS}.
 */
export const EXHAUSTION_RULE: Readonly<ExhaustionRule> = {
  maxLevel: 6,
  d20PenaltyPerLevel: 2,
  speedPenaltyFeetPerLevel: 5,
};

/**
 * Resolve the active exhaustion effect, or `null` when the character isn't
 * exhausted (VEG-449). Pure math shared by the backend compute layer (which
 * passes the seeded rule) and the frontend test fixtures (which pass
 * {@link EXHAUSTION_RULE}), so the derivation exists once and only the rule
 * *data* is ever mirrored.
 *
 * A stored `0` and a stored `null` both mean "not exhausted" — the sheet's
 * track normalizes a cleared level to null, but rows written before that
 * convention (and the encounter tracker's 0) must read the same way. Levels past
 * the rule's maximum clamp rather than scaling beyond death, matching how the
 * other table lookups treat out-of-range input; a fractional level floors.
 */
export function computeExhaustionEffect(
  rule: ExhaustionRule,
  level: number | null | undefined
): ComputedExhaustion | null {
  if (!level || !Number.isFinite(level) || level < 1) return null;
  const lvl = Math.min(rule.maxLevel, Math.floor(level));
  return {
    level: lvl,
    d20Penalty: -(rule.d20PenaltyPerLevel * lvl),
    speedPenalty: rule.speedPenaltyFeetPerLevel * lvl,
    dead: lvl >= rule.maxLevel,
  };
}

/**
 * Walking speed after the exhaustion and encumbrance reductions (VEG-490); never
 * negative. `speed` is the stored column, falling back to {@link DEFAULT_SPEED}.
 *
 * The two penalties stack additively and the result floors at 0 — a character who
 * is both severely exhausted and heavily encumbered can lose more than their
 * whole speed, and 0 is the answer rather than a negative number.
 */
export function resolveSpeed(
  speed: number | null | undefined,
  exhaustion: ComputedExhaustion | null,
  // Not nullable, unlike `exhaustion`: "no exhaustion" is a real state, but every
  // character has a carrying state — an unencumbered one is tier 'unencumbered'
  // with a 0 penalty, not an absent block. A null here would mean nothing.
  encumbrance: ComputedEncumbrance
): ComputedSpeed {
  const base = speed ?? DEFAULT_SPEED;
  const exhaustionPenalty = exhaustion?.speedPenalty ?? 0;
  const encumbrancePenalty = encumbrance.speedPenalty;
  const penalty = exhaustionPenalty + encumbrancePenalty;
  return {
    base,
    exhaustionPenalty,
    encumbrancePenalty,
    penalty,
    effective: Math.max(0, base - penalty),
  };
}

/**
 * Authoritative derived values for a character. Everything here is a pure
 * function of the character's stored inputs — recomputed per read, never
 * persisted. Spellcasting fields are null for non-casters.
 */
export interface ComputedStats {
  /** Proficiency bonus for the character's level (clamped to 1–20). */
  proficiencyBonus: number;
  /**
   * Raw ability modifiers. Deliberately *not* reduced by exhaustion (VEG-449):
   * the penalty applies to a d20 Test's roll, not to the modifier itself, and
   * the level-up / short-rest HP math reads these for the CON modifier.
   *
   * For the bonus to a bare ability *check*, use {@link ComputedStats.abilityChecks}.
   */
  abilityModifiers: ComputedAbilityModifiers;
  /**
   * Bonus for a bare ability check — the ability modifier less any exhaustion
   * penalty (VEG-449). Separate from {@link ComputedStats.abilityModifiers}
   * because an ability check *is* a d20 Test and takes the penalty, while the
   * modifier feeding HP math is not and must not.
   */
  abilityChecks: ComputedAbilityModifiers;
  /** Dexterity modifier plus the stored bonus column, less exhaustion (VEG-452). */
  initiative: ComputedInitiative;
  /** Keyed by ability full name (e.g. "Strength"); exhaustion-adjusted. */
  savingThrows: Record<string, ComputedSave>;
  /** Keyed by skill name (e.g. "Athletics"); exhaustion-adjusted. */
  skills: Record<string, ComputedSkill>;
  /** 10 + the (already exhaustion-adjusted) Perception skill bonus. */
  passivePerception: number;
  /** Spell save DC / attack bonus / modifier, or null for non-casters. */
  spellcasting: ComputedSpellcasting | null;
  /** Max spell slots per level from the class progression, or null. */
  spellSlots: ComputedSpellSlots | null;
  /** XP progress within the current level's threshold band. */
  xp: ComputedXp;
  /** AC from equipped gear, with the stored column as manual override (VEG-410). */
  armorClass: ComputedArmorClass;
  /** Attack rows derived from equipped weapons (VEG-410); manual `Character.weapons` entries are separate. */
  weapons: Weapon[];
  /** Walking speed after derived penalties (VEG-449, VEG-490). */
  speed: ComputedSpeed;
  /** Active exhaustion effect, or null when the character isn't exhausted. */
  exhaustion: ComputedExhaustion | null;
  /** Carrying state: tier, speed penalty, disadvantage, capacity, carried (VEG-490). */
  encumbrance: ComputedEncumbrance;
}
