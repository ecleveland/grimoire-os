// Tests for the shared encounter-loot aggregate helper and the Combatant.loot
// embedded shape (VEG-300). The helper lives in @grimoire-os/shared so the
// frontend can derive the same total client-side; the backend hosts its tests
// (same pattern as enums.spec.ts).

import {
  aggregateCombatantLoot,
  Combatant,
  CombatantLoot,
  EncounterLootTotal,
} from '@grimoire-os/shared';

const combatant = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Goblin',
  initiative: 12,
  hp: 7,
  maxHp: 7,
  ac: 15,
  isNpc: true,
  ...over,
});

const loot = (over: Partial<CombatantLoot> = {}): CombatantLoot => ({
  coinage: { gp: 1, sp: 2, cp: 3 },
  items: [],
  rolledAt: '2026-06-10T00:00:00.000Z',
  ...over,
});

describe('Combatant.loot shape', () => {
  it('accepts a fully-populated loot payload', () => {
    const c: Combatant = combatant({
      monsterId: 'mon-1',
      loot: {
        coinage: { gp: 10, sp: 5, cp: 0 },
        items: [
          { itemId: 'item-1', name: 'Dagger', quantity: 2, source: 'monster' },
          { itemId: null, name: 'Dragon scale', quantity: 1, source: 'trinket' },
        ],
        rolledAt: '2026-06-10T00:00:00.000Z',
      },
    });
    expect(c.loot?.items).toHaveLength(2);
  });

  it('loot is optional — pre-VEG-300 combatants parse unchanged', () => {
    const c: Combatant = combatant();
    expect(c.loot).toBeUndefined();
  });
});

describe('aggregateCombatantLoot', () => {
  it('returns a zero total for null/undefined/empty combatant lists', () => {
    const zero: EncounterLootTotal = { coinage: { gp: 0, sp: 0, cp: 0 }, items: [] };
    expect(aggregateCombatantLoot(null)).toEqual(zero);
    expect(aggregateCombatantLoot(undefined)).toEqual(zero);
    expect(aggregateCombatantLoot([])).toEqual(zero);
  });

  it('ignores combatants without loot', () => {
    expect(aggregateCombatantLoot([combatant(), combatant({ name: 'PC' })])).toEqual({
      coinage: { gp: 0, sp: 0, cp: 0 },
      items: [],
    });
  });

  it('sums coinage across combatants', () => {
    const result = aggregateCombatantLoot([
      combatant({ loot: loot({ coinage: { gp: 5, sp: 0, cp: 30 } }) }),
      combatant(),
      combatant({ loot: loot({ coinage: { gp: 2, sp: 9, cp: 1 } }) }),
    ]);
    expect(result.coinage).toEqual({ gp: 7, sp: 9, cp: 31 });
  });

  it('merges identical items (same itemId, name, source, notes) by summing quantity', () => {
    const result = aggregateCombatantLoot([
      combatant({
        loot: loot({
          items: [{ itemId: 'i1', name: 'Dagger', quantity: 2, source: 'monster' }],
        }),
      }),
      combatant({
        loot: loot({
          items: [{ itemId: 'i1', name: 'Dagger', quantity: 1, source: 'monster' }],
        }),
      }),
    ]);
    expect(result.items).toEqual([
      { itemId: 'i1', name: 'Dagger', quantity: 3, source: 'monster' },
    ]);
  });

  it('keeps distinct items separate and preserves first-seen order', () => {
    const result = aggregateCombatantLoot([
      combatant({
        loot: loot({
          items: [
            { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' },
            { itemId: 'i2', name: 'Potion of Healing', quantity: 1, source: 'magic-item' },
          ],
        }),
      }),
      combatant({
        loot: loot({
          // Same name but different source — must not merge with the pelt.
          items: [{ itemId: null, name: 'Wolf pelt', quantity: 1, source: 'trinket' }],
        }),
      }),
    ]);
    expect(result.items).toEqual([
      { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' },
      { itemId: 'i2', name: 'Potion of Healing', quantity: 1, source: 'magic-item' },
      { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'trinket' },
    ]);
  });

  it('does not merge items whose notes differ — merging would silently drop one note', () => {
    const result = aggregateCombatantLoot([
      combatant({
        loot: loot({
          items: [{ itemId: 'i1', name: 'Dagger', quantity: 1, source: 'monster', notes: 'rusty' }],
        }),
      }),
      combatant({
        loot: loot({
          items: [
            { itemId: 'i1', name: 'Dagger', quantity: 1, source: 'monster', notes: 'ornate' },
          ],
        }),
      }),
    ]);
    expect(result.items).toEqual([
      { itemId: 'i1', name: 'Dagger', quantity: 1, source: 'monster', notes: 'rusty' },
      { itemId: 'i1', name: 'Dagger', quantity: 1, source: 'monster', notes: 'ornate' },
    ]);
  });

  it('does not mutate the input combatants or their items', () => {
    const input = [
      combatant({
        loot: loot({ items: [{ itemId: 'i1', name: 'Dagger', quantity: 2, source: 'monster' }] }),
      }),
      combatant({
        loot: loot({ items: [{ itemId: 'i1', name: 'Dagger', quantity: 5, source: 'monster' }] }),
      }),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    aggregateCombatantLoot(input);
    expect(input).toEqual(snapshot);
  });
});
