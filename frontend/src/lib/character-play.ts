import type {
  CharacterResource,
  CombatantConcentration,
  Condition,
  DeathSaves,
  HitDice,
  HitPoints,
  SpellSlot,
} from '@/lib/types';
import { applyDamage, applyHeal } from './combatant-hp';
import { recoverResources } from './character-resources';
import { clampIntToRange } from './form-helpers';

/**
 * Pure state transitions for the in-sheet play controls (VEG-349). The sheet
 * components mutate only *stored* character state through these helpers; derived
 * values (DCs, attack bonuses, modifiers) stay owned by the computed-stats
 * layer. Clamp rules live here so the UI and tests share one source of truth.
 *
 * HP arithmetic reuses the encounter tracker's `combatant-hp` helpers
 * (VEG-286) via a field-name adapter — the `Combatant` shape uses
 * `hp/maxHp/tempHp` while a character's `HitPoints` uses `current/max/temporary`.
 */

/** Damage: temp HP absorbs first, then current; current floors at 0. */
export function damageHitPoints(hp: HitPoints, amount: number): HitPoints {
  const { hp: current, tempHp } = applyDamage({ hp: hp.current, tempHp: hp.temporary }, amount);
  return { ...hp, current, temporary: tempHp };
}

/** Heal: raises current, clamped to max. Temp HP is never healed. */
export function healHitPoints(hp: HitPoints, amount: number): HitPoints {
  const { hp: current } = applyHeal({ hp: hp.current, maxHp: hp.max }, amount);
  return { ...hp, current };
}

/**
 * Set temporary HP to an explicit value (clamped to a non-negative integer).
 * Unlike the encounter tracker's non-stacking `grantTempHp`, the sheet's "Set
 * Temp" action is a direct set — the player enters the value granted to them,
 * not a competing source to reconcile.
 */
export function setTempHitPoints(hp: HitPoints, amount: number): HitPoints {
  return { ...hp, temporary: Math.max(0, Math.floor(amount)) };
}

/** A zeroed death-save track — what a revive above 0 HP resets to. */
export const CLEARED_DEATH_SAVES = { successes: 0, failures: 0 } as const;

/**
 * Whether the track has anything to clear. Extracted (VEG-488) so
 * `applyLongRest`'s omit-when-unchanged guard and the revive rule below can't
 * drift apart — they ask the same question of the same shape.
 */
export function hasDeathSaves(saves: DeathSaves): boolean {
  return saves.successes > 0 || saves.failures > 0;
}

/**
 * Death saves only apply while a PC is down: reviving above 0 HP clears them
 * (5e). Mirrors the encounter tracker's `clearDeathSavesIfRevived`
 * (`lib/death-saves.ts`) rule, but for the character sheet's zeroed-object
 * shape (the sheet always renders `deathSaves`, so it resets to 0/0 rather than
 * deleting the field). Returns the cleared track when a heal lands the PC above
 * 0 with saves on the sheet, else `null` (nothing to change).
 */
export function deathSavesAfterRevive(nextCurrent: number, saves: DeathSaves): DeathSaves | null {
  return nextCurrent > 0 && hasDeathSaves(saves) ? { ...CLEARED_DEATH_SAVES } : null;
}

/**
 * Parse a numeric form field to a non-negative integer (blank/NaN → 0). Shared
 * by the HP-amount and coin inputs so the "reject negatives, floor to int"
 * decision lives in one place. (Distinct from `parseIntField`, which truncates
 * but allows negatives, used by the encounter dialogs.)
 *
 * The floor-only case of `clampIntToRange` (VEG-500). Callers that also have a
 * ceiling should use that directly rather than wrapping this in a `Math.min`.
 */
export function parseNonNegativeInt(value: string): number {
  return clampIntToRange(value, 0, Number.MAX_SAFE_INTEGER);
}

/**
 * Toggle a pip track to `index`. Clicking the highest filled pip clears it
 * (count = index); clicking any other pip fills up to and including it
 * (count = index + 1). Clamped to `0..max`. Shared by death saves (max 3) and
 * spell slots (max = slot total).
 */
export function togglePip(current: number, index: number, max: number): number {
  const next = index + 1 === current ? index : index + 1;
  return Math.max(0, Math.min(max, next));
}

/** Adjust hit dice spent by `delta` (+1 spend, -1 restore); clamped to 0..total. */
export function adjustHitDiceSpent(hitDice: HitDice, delta: number): HitDice {
  return { ...hitDice, spent: Math.max(0, Math.min(hitDice.total, hitDice.spent + delta)) };
}

/**
 * Number of spent hit dice a long rest restores: half your total, rounded down,
 * but never fewer than one (5e PHB "minimum of one die"). The actual restore is
 * still capped by how many were spent — see `applyLongRest`.
 */
export function hitDiceRegainedOnLongRest(total: number): number {
  return Math.max(1, Math.floor(total / 2));
}

/**
 * Exhaustion level after a long rest (VEG-487): one level lower, or `null` once
 * the track is clear. The seeded `resting/long-rest` rule reads "Reduce
 * exhaustion level by 1 (if fed)" — prose, so the arithmetic lives here rather
 * than being read from the game-rules API.
 *
 * `null` is the sheet's "no exhaustion" (StatusTracker reads
 * `character.exhaustion || null`), so level 1 steps down to `null`, never a
 * stored 0. An unexhausted character is normalized to `null` so callers can
 * skip the field entirely.
 */
export function exhaustionAfterLongRest(current: number | null): number | null {
  if (!current || current <= 1) return null;
  return current - 1;
}

/**
 * Hit points one spent hit die restores on a short rest: the die roll plus the
 * CON modifier, floored at 0.
 *
 * Deliberately *not* `hpGain` (character-level.ts), which clamps to a minimum
 * of 1 — that is the level-up rule ("minimum 1 HP per level"). A short rest has
 * no minimum, so a low roll under a CON penalty heals nothing while still
 * costing the die.
 */
export function shortRestHealPerDie(roll: number, conMod: number): number {
  return Math.max(0, roll + conMod);
}

/**
 * The single composite write a long rest produces (VEG-407), structurally a
 * `CharacterPatch` so it flows straight through `useCharacterMutation`. `hitDice`
 * and `spellSlots` are omitted when the character has none, so a non-caster or a
 * hit-dice-less sheet doesn't get spurious empty-array/undefined writes.
 */
export interface LongRestPatch {
  // Omitted for a character with no stored HP block (VEG-425) — a long rest
  // must never fabricate-and-persist a zeroed HitPoints onto a null-HP record.
  hitPoints?: HitPoints;
  // Omitted when the track is already clear (VEG-488). Was the one non-optional
  // field here, which made `applyLongRest` incapable of returning an empty patch
  // and so made every fully-rested click a wasted write.
  deathSaves?: DeathSaves;
  hitDice?: HitDice;
  spellSlots?: SpellSlot[];
  resources?: CharacterResource[];
  // Omitted when the character isn't exhausted (VEG-487): writing an unchanged
  // field burns an optimistic-lock version for no state change.
  exhaustion?: number | null;
}

/**
 * Long rest (5e): HP to max, temp HP cleared, every spell slot reset to
 * `used: 0`, spent hit dice regained up to half total (rounded down, min 1,
 * capped at spent), exhaustion reduced by one level, and death saves cleared.
 * Composes the per-field rules so the UI and tests share one source of truth —
 * the sheet just dispatches the result.
 */
export function applyLongRest(character: {
  // All four are nullable at the API boundary (VEG-425): the columns are
  // `Json?`, so a minimal character has no `hitPoints`, a non-caster has `null`
  // `spellSlots`, and a hit-dice-less sheet omits `hitDice`. Each is omitted from
  // the patch when absent, so the rest never writes a fabricated block back.
  hitPoints: HitPoints | null;
  hitDice?: HitDice | null;
  spellSlots?: SpellSlot[] | null;
  resources?: CharacterResource[] | null;
  exhaustion?: number | null;
  deathSaves?: DeathSaves | null;
}): LongRestPatch {
  const { hitPoints, spellSlots, hitDice, resources, exhaustion, deathSaves } = character;
  const patch: LongRestPatch = {};
  // Only when there is a mark to clear (VEG-488), sharing the predicate with
  // `deathSavesAfterRevive`. A long rest clears the track unconditionally in
  // 5e, but writing an already-zeroed track back is a state change of nothing.
  if (deathSaves && hasDeathSaves(deathSaves)) {
    patch.deathSaves = { ...CLEARED_DEATH_SAVES };
  }
  if (exhaustion) {
    patch.exhaustion = exhaustionAfterLongRest(exhaustion);
  }
  // Temp HP does not survive a long rest, so a character at full HP still needs
  // the write when it has any — but one at max with no temp changes nothing.
  if (hitPoints && (hitPoints.current < hitPoints.max || hitPoints.temporary > 0)) {
    patch.hitPoints = { ...hitPoints, current: hitPoints.max, temporary: 0 };
  }
  if (hitDice && hitDice.spent > 0) {
    const regained = hitDiceRegainedOnLongRest(hitDice.total);
    patch.hitDice = { ...hitDice, spent: Math.max(0, hitDice.spent - regained) };
  }
  if (spellSlots?.some(slot => slot.used > 0)) {
    patch.spellSlots = spellSlots.map(slot => ({ ...slot, used: 0 }));
  }
  // Only when something is actually spent: patching an identical array burns an
  // optimistic-lock version and makes the rest summary claim a recovery that
  // never happened (found resting twice in a row, VEG-487).
  if (resources?.some(r => r.used > 0)) {
    patch.resources = recoverResources(resources, 'long');
  }
  return patch;
}

/**
 * The composite write a short rest produces (VEG-409, extended VEG-487): the
 * `recharge: 'short'` resources reset, plus — when the player spent hit dice —
 * the healing they bought and the dice it cost. Every field is omitted when it
 * wouldn't change, so the button never writes a fabricated block back.
 */
export interface ShortRestPatch {
  resources?: CharacterResource[];
  // These three travel together and are not independently producible: `hitPoints`
  // only ever comes from a die spend, and `deathSaves` only from that heal
  // reviving a downed character. The type can't express the coupling without a
  // union that would break the imperative build style shared with
  // `applyLongRest`, so it's stated here — `formatShortRestSummary` reads
  // `hitPoints` and `hitDice` separately and is correct only because of it.
  hitPoints?: HitPoints;
  hitDice?: HitDice;
  deathSaves?: DeathSaves;
}

/**
 * `healPerDie` carries the per-die heal totals the player already resolved
 * (rolled or fixed average, each via `shortRestHealPerDie`) — not raw die faces
 * and not a die count. It is a named field rather than a bare `number[]`
 * precisely because callers hold both shapes: `ShortRestDialog` keeps raw faces
 * in `rolls` and totals in `heals`, and passing the wrong one would type-check
 * while silently under-healing by the CON modifier per die. Mirrors
 * `applyLevelUp`'s `changes` argument. Omit it for a resource-only rest.
 *
 * 5e spends hit dice at the player's discretion, so nothing here is automatic:
 * a die that healed 0 is still spent, because the player chose to pay it.
 */
export function applyShortRest(
  character: {
    resources?: CharacterResource[] | null;
    hitPoints?: HitPoints | null;
    hitDice?: HitDice | null;
    deathSaves?: DeathSaves | null;
  },
  spend: { healPerDie?: number[] } = {}
): ShortRestPatch {
  const { resources, hitPoints, hitDice, deathSaves } = character;
  const spentDice = spend.healPerDie ?? [];
  const patch: ShortRestPatch = {};

  // Empty when nothing would change: patching an identical array burns an
  // optimistic-lock version and 409s a concurrent session for a no-op click.
  if (resources?.some(r => r.recharge === 'short' && r.used > 0)) {
    patch.resources = recoverResources(resources, 'short');
  }

  // Hit dice can only be spent by a character that has them; the clamp caps the
  // spend at what actually remains even if the caller over-supplies rolls. When
  // none remain the clamp is a no-op, so the field is dropped rather than
  // written back identical (which would still read as a confirmable change).
  if (spentDice.length > 0 && hitDice && hitDice.spent < hitDice.total) {
    patch.hitDice = adjustHitDiceSpent(hitDice, spentDice.length);
    // Only the dice the clamp actually allowed may heal.
    const allowed = patch.hitDice.spent - hitDice.spent;
    const healed = spentDice.slice(0, allowed).reduce((sum, hp) => sum + hp, 0);
    // Omitted for a null-HP record (VEG-425) — same invariant as applyLongRest.
    if (hitPoints && healed > 0) {
      const next = healHitPoints(hitPoints, healed);
      patch.hitPoints = next;
      const cleared = deathSavesAfterRevive(next.current, deathSaves ?? CLEARED_DEATH_SAVES);
      if (cleared) patch.deathSaves = cleared;
    }
  }

  return patch;
}

// ── Rest summaries (VEG-487) ─────────────────────────────

/** "1 hit die" / "4 hit dice" — the one irregular plural in the summaries. */
function hitDiceLabel(count: number): string {
  return count === 1 ? '1 hit die' : `${count} hit dice`;
}

/** Join summary clauses into a sentence, or say plainly that nothing changed. */
function joinSummary(parts: string[], nothingChanged: string): string {
  return parts.length > 0 ? `${parts.join(', ')}.` : nothingChanged;
}

/**
 * Describe what a long rest actually changed, for the confirmation toast.
 * Built from the character's pre-rest state and the patch that was written, so
 * the wording can't drift from the rules — and clauses for fields that didn't
 * move are dropped rather than reported as zeroes.
 */
export function formatLongRestSummary(
  before: { hitPoints?: HitPoints | null; hitDice?: HitDice | null },
  patch: LongRestPatch
): string {
  const parts: string[] = [];

  const healed = (patch.hitPoints?.current ?? 0) - (before.hitPoints?.current ?? 0);
  if (healed > 0) parts.push(`+${healed} HP`);

  // A long rest destroys temp HP. Reporting only the `current` delta made a
  // full-HP character's rest read as "nothing changed" while consuming it.
  const tempCleared = patch.hitPoints ? (before.hitPoints?.temporary ?? 0) : 0;
  if (tempCleared > 0) parts.push(`${tempCleared} temp HP cleared`);

  const regained = (before.hitDice?.spent ?? 0) - (patch.hitDice?.spent ?? 0);
  if (regained > 0) parts.push(`${hitDiceLabel(regained)} regained`);

  // Each of these is present only when it actually changed (see applyLongRest),
  // so presence is the signal — a value check can't distinguish "restored to 0"
  // from "was already 0".
  if (patch.spellSlots) parts.push('spell slots restored');
  if (patch.resources) parts.push('resources recharged');

  if (patch.exhaustion !== undefined) {
    parts.push(
      patch.exhaustion === null ? 'exhaustion cleared' : `exhaustion down to ${patch.exhaustion}`
    );
  }

  // Reportable only since VEG-488 made the field presence-signalled: while it
  // was always written, a downed character's rest cleared a track the player
  // could see and the toast still said "already fully rested".
  if (patch.deathSaves) parts.push('death saves cleared');

  return joinSummary(parts, 'Long rest taken — already fully rested.');
}

/** Describe what a short rest changed. See `formatLongRestSummary`. */
export function formatShortRestSummary(
  before: { hitPoints?: HitPoints | null; hitDice?: HitDice | null },
  patch: ShortRestPatch
): string {
  const parts: string[] = [];

  const healed = (patch.hitPoints?.current ?? 0) - (before.hitPoints?.current ?? 0);
  if (healed > 0) parts.push(`+${healed} HP`);

  const spent = (patch.hitDice?.spent ?? 0) - (before.hitDice?.spent ?? 0);
  if (spent > 0) parts.push(`${hitDiceLabel(spent)} spent`);

  if (patch.resources) parts.push('resources recharged');

  return joinSummary(parts, 'Short rest taken — nothing to recover.');
}

// ── Status tracker (VEG-408) ─────────────────────────────

/** Toggle an SRD condition: present → removed, absent → appended. */
export function toggleConditionInList(current: Condition[], condition: Condition): Condition[] {
  return current.includes(condition)
    ? current.filter(c => c !== condition)
    : [...current, condition];
}

/**
 * Set the exhaustion level from a track click. Clicking the current level
 * clears it (null). The out-of-range → clear branch is defensive — the sheet's
 * track only ever passes 1–6 — so a bad caller clears rather than persisting
 * an impossible level.
 */
export function setExhaustionLevel(current: number | null, level: number): number | null {
  if (level < 1 || level > 6 || level === current) return null;
  return level;
}

/**
 * Build the concentration object from the spell-name input: an empty name
 * keeps concentrating but drops the label (VEG-287 semantics — the object's
 * presence is what means "concentrating").
 */
export function concentrationFromSpellInput(spell: string): CombatantConcentration {
  const trimmed = spell.trim();
  return trimmed ? { spell: trimmed } : {};
}
