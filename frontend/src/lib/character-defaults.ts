import type { AbilityScores, Currency, HitPoints } from '@/lib/types';

/**
 * Neutral fallbacks for a character whose embedded stats are `null` (VEG-425).
 * The Prisma JSON columns are nullable, so a legacy/minimal character can come
 * back with `abilityScores`, `hitPoints`, `currency`, etc. absent.
 *
 * The read-only sheet uses these purely to render a degenerate-but-safe view
 * instead of crashing on a null dereference — the play controls (`patch()`) gate
 * their writes on the real field so a fabricated fallback is never persisted.
 * The character *editor* is the deliberate exception: it seeds a null field from
 * these as an editable starting value (same as a brand-new character), which its
 * save path then persists — that's the editor filling in the blanks, by design.
 */

/** All-10 scores → +0 modifiers, the neutral 5e baseline. */
export const DEFAULT_ABILITY_SCORES: AbilityScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

/** Empty purse. */
export const EMPTY_CURRENCY: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

/** Zeroed HP block — renders 0/0, affords no long-rest healing. */
export const ZERO_HIT_POINTS: HitPoints = { max: 0, current: 0, temporary: 0 };

/** Default walking speed (ft) when a character has no stored speed. */
export const DEFAULT_SPEED = 30;
