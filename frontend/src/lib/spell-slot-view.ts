import type { ComputedSpellSlots, SpellSlot } from '@/lib/types';

/**
 * Stored-vs-computed spell-slot reconciliation (VEG-412).
 *
 * The class progression (`computed.spellSlots`, derived server-side) is the
 * authority on slot maxima as a FLOOR, not a ceiling; the stored
 * `Character.spellSlots` array owns the mutable play state (`used`). The sheet
 * renders the merged view below and writes back through `writeSlotUsed`, which
 * heals a stale stored `total` UP to the progression floor on first touch. The
 * Rest and Level-up stories reuse these rules.
 *
 * Merge rules (union — never hide or destroy player data):
 * - Each level's max is the LARGER of the progression value and the stored
 *   total. A stored total above the progression is a deliberate grant
 *   (DM-granted or multiclass slots) and is preserved on display and on write;
 *   a stored total below it heals up to the authoritative value.
 * - A level only in the progression renders with `used: 0`; a level only in
 *   the stored array keeps its stored track.
 * - `used` clamps into 0..max, so a corrupt row can't overfill its track.
 * - Levels that end up with max 0 (progression grants none, no stored row)
 *   are not rendered.
 * - No computed block (non-caster, or homebrew class without progression
 *   data) → the stored array renders verbatim.
 *
 * Known trade-off (documented decision, VEG-412): a stored row at a level the
 * progression no longer covers is indistinguishable from a DM grant, so a
 * level change that shifts slot levels (pact casters especially) leaves the
 * old row rendering until an explicit edit/level-up flow rewrites the stored
 * array. Keeping it is deliberate — dropping it would silently destroy
 * legitimate multiclass/homebrew slots.
 */
export interface SpellSlotView {
  level: number;
  max: number;
  used: number;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function resolveSpellSlotView(
  stored: SpellSlot[] | null | undefined,
  computed: ComputedSpellSlots | null
): SpellSlotView[] {
  const storedSlots = stored ?? [];
  const maxByLevel = computed?.maxByLevel ?? {};
  const levels = new Set<number>([
    ...Object.keys(maxByLevel).map(Number),
    ...storedSlots.map(s => s.level),
  ]);
  return [...levels]
    .map(level => {
      const storedSlot = storedSlots.find(s => s.level === level);
      const max = Math.max(maxByLevel[level] ?? 0, storedSlot?.total ?? 0);
      return { level, max, used: clamp(storedSlot?.used ?? 0, max) };
    })
    .filter(view => view.max > 0)
    .sort((a, b) => a.level - b.level);
}

/**
 * Write a slot's `used` back into the stored array: upserts the level (a
 * progression-only level has no stored entry yet), clamps `used` into 0..max,
 * and sets `total` to the view's max. Because the view max is never below the
 * stored total, this heals a stale total upward but never shrinks a grant.
 */
export function writeSlotUsed(
  stored: SpellSlot[] | null | undefined,
  level: number,
  used: number,
  max: number
): SpellSlot[] {
  const next = (stored ?? []).filter(s => s.level !== level);
  next.push({ level, total: max, used: clamp(used, max) });
  return next.sort((a, b) => a.level - b.level);
}
