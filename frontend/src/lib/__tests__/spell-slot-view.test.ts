import { describe, it, expect } from 'vitest';
import { resolveSpellSlotView, writeSlotUsed } from '@/lib/spell-slot-view';
import type { ComputedSpellSlots, SpellSlot } from '@/lib/types';

// VEG-412: the sheet renders spell-slot pips from a merged view — the class
// progression (computed) owns the maxima, the stored array owns the mutable
// `used` state, and stored-only levels are kept (multiclass/DM-granted slots
// must never silently vanish).

const stored: SpellSlot[] = [
  { level: 1, total: 3, used: 2 },
  { level: 2, total: 2, used: 1 },
];

const computed: ComputedSpellSlots = {
  caster: 'full',
  maxByLevel: { 1: 4, 2: 3, 3: 2 },
};

describe('resolveSpellSlotView', () => {
  describe('no computed block (homebrew class with no progression data)', () => {
    it('returns [] when both sources are empty', () => {
      expect(resolveSpellSlotView(null, null)).toEqual([]);
      expect(resolveSpellSlotView(undefined, null)).toEqual([]);
      expect(resolveSpellSlotView([], null)).toEqual([]);
    });

    it('falls back to the stored array verbatim', () => {
      expect(resolveSpellSlotView(stored, null)).toEqual([
        { level: 1, max: 3, used: 2 },
        { level: 2, max: 2, used: 1 },
      ]);
    });

    it('clamps a stored used above its own total', () => {
      expect(resolveSpellSlotView([{ level: 1, total: 2, used: 5 }], null)).toEqual([
        { level: 1, max: 2, used: 2 },
      ]);
    });
  });

  describe('merge with the computed progression', () => {
    it('computed max wins for levels the progression covers', () => {
      const view = resolveSpellSlotView(stored, computed);
      expect(view.find(v => v.level === 1)).toEqual({ level: 1, max: 4, used: 2 });
      expect(view.find(v => v.level === 2)).toEqual({ level: 2, max: 3, used: 1 });
    });

    it('adds computed-only levels with used 0', () => {
      const view = resolveSpellSlotView(stored, computed);
      expect(view.find(v => v.level === 3)).toEqual({ level: 3, max: 2, used: 0 });
    });

    it('renders the full progression for an empty/null stored array', () => {
      expect(resolveSpellSlotView([], computed)).toEqual([
        { level: 1, max: 4, used: 0 },
        { level: 2, max: 3, used: 0 },
        { level: 3, max: 2, used: 0 },
      ]);
      expect(resolveSpellSlotView(null, computed)).toHaveLength(3);
    });

    it('keeps stored-only levels at their stored max (multiclass/DM-granted)', () => {
      const view = resolveSpellSlotView(
        [...stored, { level: 5, total: 2, used: 1 }],
        computed // progression tops out at level 3
      );
      expect(view.find(v => v.level === 5)).toEqual({ level: 5, max: 2, used: 1 });
    });

    it('preserves a stored total above the progression max (DM-granted extra slots)', () => {
      // The progression is a floor, not a ceiling: a stored total above it is a
      // deliberate grant and must keep rendering (and never be healed down).
      const view = resolveSpellSlotView(
        [{ level: 3, total: 4, used: 4 }],
        computed // level 3 progression max is 2
      );
      expect(view.find(v => v.level === 3)).toEqual({ level: 3, max: 4, used: 4 });
    });

    it('clamps used down to the stored total when it overshoots', () => {
      const view = resolveSpellSlotView([{ level: 3, total: 2, used: 4 }], computed);
      expect(view.find(v => v.level === 3)).toEqual({ level: 3, max: 2, used: 2 });
    });

    it('keeps a stored row at a level the progression covers with zero slots', () => {
      const view = resolveSpellSlotView(
        [{ level: 1, total: 2, used: 1 }],
        { caster: 'full', maxByLevel: { 1: 0, 2: 3 } } // explicit zero at L1
      );
      expect(view).toEqual([
        { level: 1, max: 2, used: 1 },
        { level: 2, max: 3, used: 0 },
      ]);
    });

    it('does not render a zero-slot progression level with no stored row', () => {
      const view = resolveSpellSlotView([], { caster: 'full', maxByLevel: { 1: 0, 2: 3 } });
      expect(view).toEqual([{ level: 2, max: 3, used: 0 }]);
    });

    it('sorts the merged view by slot level ascending', () => {
      const view = resolveSpellSlotView(
        [
          { level: 5, total: 1, used: 0 },
          { level: 1, total: 3, used: 0 },
        ],
        { caster: 'pact', maxByLevel: { 3: 2 } }
      );
      expect(view.map(v => v.level)).toEqual([1, 3, 5]);
    });
  });
});

describe('writeSlotUsed', () => {
  it('updates the matching level and heals a stale total to the view max', () => {
    expect(writeSlotUsed(stored, 1, 3, 4)).toEqual([
      { level: 1, total: 4, used: 3 },
      { level: 2, total: 2, used: 1 },
    ]);
  });

  it('upserts a level absent from the stored array (computed-only level)', () => {
    expect(writeSlotUsed(stored, 3, 1, 2)).toEqual([
      { level: 1, total: 3, used: 2 },
      { level: 2, total: 2, used: 1 },
      { level: 3, total: 2, used: 1 },
    ]);
  });

  it('clamps used into 0..max', () => {
    expect(writeSlotUsed(stored, 1, 9, 4)[0]).toEqual({ level: 1, total: 4, used: 4 });
    expect(writeSlotUsed(stored, 1, -2, 4)[0]).toEqual({ level: 1, total: 4, used: 0 });
  });

  it('writes into an empty or null stored array', () => {
    expect(writeSlotUsed([], 2, 1, 3)).toEqual([{ level: 2, total: 3, used: 1 }]);
    expect(writeSlotUsed(null, 2, 1, 3)).toEqual([{ level: 2, total: 3, used: 1 }]);
  });

  it('keeps the result sorted by level after an upsert', () => {
    const result = writeSlotUsed([{ level: 4, total: 1, used: 0 }], 2, 1, 3);
    expect(result.map(s => s.level)).toEqual([2, 4]);
  });
});
