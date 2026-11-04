import type {
  CharacterClass,
  ComputedXp,
  DieType,
  Feature,
  HitDice,
  HitPoints,
  SrdClass,
} from '@/lib/types';

/**
 * Pure helpers for the XP → level-up assistant (VEG-411). Mirrors the
 * `character-play.ts` pattern: the dialog mutates only *stored* character
 * state through these; derived values (proficiency bonus, spell-slot maxima,
 * XP thresholds) stay owned by the backend computed-stats layer and update on
 * the next read once `level` lands.
 */

export const MAX_LEVEL = 20;

/**
 * Postgres int4 ceiling for stored `experiencePoints` — the Award XP control
 * refuses awards past it. Local copy of the shared `MAX_EXPERIENCE_POINTS`
 * (the DTO's `@Max` bound): app code can't value-import from the file-linked
 * shared package (Turbopack, see types.ts header). A drift-guard test pins
 * the two together.
 */
export const MAX_XP = 2_147_483_647;

/** Numeric faces of a die ('d10' → 10). */
export function dieFaces(dieType: DieType): number {
  return Number(dieType.slice(1));
}

/**
 * Fixed average hit points a class die grants per level: faces/2 + 1. Yields
 * the seeded `hp-calculation/average-per-die` table (d6→4 … d12→7) — the
 * drift-guard test pins the four SRD values.
 */
export function averageHpForDie(dieType: DieType): number {
  return Math.floor(dieFaces(dieType) / 2) + 1;
}

/**
 * HP gained for one level: die roll (or fixed average) + CON modifier,
 * clamped to the seeded `minimumPerLevel` of 1.
 */
export function hpGain(base: number, conMod: number): number {
  return Math.max(1, base + conMod);
}

/**
 * Catalog features unlocked at exactly `level`, shaped as stored character
 * features with the class name as `source` — the grouping key
 * `ClassFeatures.tsx` renders by — and the granting level, which is what
 * `characterFeatureIdentity` needs to tell one occurrence of a recurring name
 * from the next (VEG-454). Dropping it here was where that information was lost.
 */
export function classFeaturesAtLevel(cls: SrdClass, level: number): Feature[] {
  return cls.features
    .filter(f => f.level === level)
    .map(f => ({
      name: f.name,
      source: cls.name,
      level: f.level,
      ...(f.description !== undefined && { description: f.description }),
    }));
}

/** Progress through the current XP band as 0–100, or null at max level. */
export function xpProgressPercent(xp: ComputedXp): number | null {
  if (xp.span === null) return null;
  return Math.min(100, (xp.into / xp.span) * 100);
}

/**
 * The single composite write a level-up produces, structurally a
 * `CharacterPatch` so it flows straight through `useCharacterMutation`.
 * `spellSlots` and proficiency are deliberately absent: the computed layer
 * re-derives both from the bumped level, and `resolveSpellSlotView` lets the
 * class progression own slot maxima (VEG-412) — writing them here would fight
 * that reconciliation.
 */
export interface LevelUpPatch {
  level: number;
  // The server requires the class levels to add up to `level`, so the class
  // that gained the level travels with it. Omitted for a character with no
  // class recorded, which the sum rule does not cover.
  classes?: CharacterClass[];
  // Omitted when the character has no stored HP block (VEG-425): one level's
  // gain can't reconstruct a cumulative max, so fabricating one would persist
  // a confidently-wrong value.
  hitPoints?: HitPoints;
  hitDice?: HitDice[];
  features?: Feature[];
}

export function applyLevelUp(
  character: {
    level: number;
    classes: CharacterClass[];
    hitPoints: HitPoints | null;
    hitDice?: HitDice[] | null;
    features?: Feature[] | null;
  },
  changes: {
    /** Resolved HP gain, or null when HP was skipped (no stored HP block). */
    hpGain: number | null;
    newFeatures: Feature[];
    /**
     * The die of the class gaining the level: its pool gains one die, or a new
     * pool starts with it. Required, and not nullable, since VEG-530: this used
     * to fall back to a hardcoded d8, so a caller that could not resolve a die
     * got one silently written into a permanent pool. `LevelUpDialog` is the
     * only caller and always has a concrete die: the first pool's, the class's,
     * or one the player picked.
     */
    classHitDie: DieType;
  }
): LevelUpPatch {
  const newLevel = character.level + 1;
  const patch: LevelUpPatch = { level: newLevel };

  if (character.hitPoints && changes.hpGain !== null) {
    patch.hitPoints = {
      ...character.hitPoints,
      max: character.hitPoints.max + changes.hpGain,
      current: character.hitPoints.current + changes.hpGain,
    };
  }

  // Level-up adds to the class taken at level 1, the only class a character can
  // hold until a later picker lets the player choose another.
  const [first, ...rest] = character.classes;
  if (first) patch.classes = [{ ...first, level: first.level + 1 }, ...rest];

  // A level-N character owns N hit dice: the level's die joins the pool of the
  // same die, or starts a pool of its own. With no pools at all the whole set
  // is derivable, unlike HP, so it is seeded at the new level.
  const pools = character.hitDice ?? [];
  const die = changes.classHitDie;
  if (pools.some(pool => pool.dieType === die)) {
    patch.hitDice = pools.map(pool =>
      pool.dieType === die ? { ...pool, total: pool.total + 1 } : pool
    );
  } else if (pools.length > 0) {
    patch.hitDice = [...pools, { dieType: die, total: 1, spent: 0 }];
  } else {
    patch.hitDice = [{ dieType: die, total: newLevel, spent: 0 }];
  }

  if (changes.newFeatures.length > 0) {
    patch.features = [...(character.features ?? []), ...changes.newFeatures];
  }

  return patch;
}
