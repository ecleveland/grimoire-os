import type { ComputedSpellSlots, SpellSlot } from '@/lib/types';

/**
 * Stored-vs-computed spell-slot reconciliation (VEG-412).
 *
 * Ownership rule: a level the class progression covers with >0 slots is OWNED
 * by the progression — its max wins in both directions, so a stored `total`
 * that drifted (stale seed data, or a total baked in by `writeSlotUsed` during
 * a transient level change) self-heals on display instead of ratcheting
 * permanently. Every other level (absent from the progression, or covered
 * with an explicit 0) is owned by the stored array — multiclass or DM-granted
 * rows live only there and must never silently vanish. `used` always comes
 * from the stored array, clamped into 0..max.
 *
 * No computed block at all (non-caster, or homebrew class without progression
 * data) → the stored array renders verbatim.
 *
 * Known trade-off (documented decision, VEG-412): a stored row at a level the
 * progression doesn't cover is indistinguishable from a DM grant, so a level
 * change that shifts slot levels (pact casters especially) leaves the old row
 * rendering until an explicit edit/level-up flow rewrites the stored array.
 * Keeping it is deliberate — dropping it would destroy legitimate
 * multiclass/homebrew slots.
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
      const progressionMax = maxByLevel[level] ?? 0;
      const storedSlot = storedSlots.find(s => s.level === level);
      if (progressionMax > 0) {
        return { level, max: progressionMax, used: clamp(storedSlot?.used ?? 0, progressionMax) };
      }
      return storedSlot
        ? { level, max: storedSlot.total, used: clamp(storedSlot.used, storedSlot.total) }
        : null;
    })
    .filter((view): view is SpellSlotView => view !== null && view.max > 0)
    .sort((a, b) => a.level - b.level);
}

/**
 * Write a slot's `used` back into the stored array: upserts the level (a
 * progression-only level has no stored entry yet), clamps `used` into 0..max,
 * and stores the view's max as `total`. Writing the max is safe under the
 * ownership rule above — at progression-covered levels the display always
 * follows the progression regardless of what was stored, so a total written
 * during a transient state converges instead of ratcheting.
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
