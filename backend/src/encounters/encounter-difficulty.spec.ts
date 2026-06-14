// Tests for the shared encounter-difficulty helpers (VEG-362). The math lives
// in @grimoire-os/shared so the create page, the tracker, and the backend all
// derive the same numbers; the backend hosts its tests (same pattern as the
// loot aggregate, combatant-loot.spec.ts).

import {
  xpForCr,
  partyBudget,
  summarizeEncounter,
  XP_BUDGET_PER_CHARACTER,
  Combatant,
} from '@grimoire-os/shared';

const monster = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Goblin',
  initiative: 12,
  hp: 7,
  maxHp: 7,
  ac: 15,
  isNpc: true,
  monsterId: 'mon-goblin',
  cr: 0.25,
  xp: 50,
  ...over,
});

const pc = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Aragorn',
  initiative: 10,
  hp: 40,
  maxHp: 45,
  ac: 16,
  isNpc: false,
  level: 3,
  ...over,
});

describe('xpForCr', () => {
  it('maps the canonical CR→XP table', () => {
    expect(xpForCr(0)).toBe(10);
    expect(xpForCr(0.125)).toBe(25);
    expect(xpForCr(0.25)).toBe(50);
    expect(xpForCr(0.5)).toBe(100);
    expect(xpForCr(1)).toBe(200);
    expect(xpForCr(2)).toBe(450);
    expect(xpForCr(5)).toBe(1800);
    expect(xpForCr(10)).toBe(5900);
    expect(xpForCr(15)).toBe(13000);
    expect(xpForCr(20)).toBe(25000);
    expect(xpForCr(30)).toBe(155000);
  });

  it('returns 0 for a CR outside the table', () => {
    expect(xpForCr(0.3)).toBe(0);
    expect(xpForCr(31)).toBe(0);
  });
});

describe('partyBudget', () => {
  it('sums the per-character 2024 budget across equal levels', () => {
    // Level 3: 150 / 225 / 400 per character.
    expect(partyBudget([3, 3, 3, 3])).toEqual({ low: 600, moderate: 900, high: 1600 });
  });

  it('sums across mixed levels', () => {
    // L1 (50/75/100) + L5 (500/750/1100).
    expect(partyBudget([1, 5])).toEqual({ low: 550, moderate: 825, high: 1200 });
  });

  it('clamps levels into the 1–20 table range', () => {
    expect(partyBudget([0])).toEqual(XP_BUDGET_PER_CHARACTER[1]);
    expect(partyBudget([25])).toEqual(XP_BUDGET_PER_CHARACTER[20]);
  });

  it('returns null for an empty party', () => {
    expect(partyBudget([])).toBeNull();
  });
});

describe('summarizeEncounter', () => {
  it('totals monster XP and CR, excluding PCs, and rates the band against the party', () => {
    const result = summarizeEncounter([
      monster({ cr: 0.25, xp: 50 }),
      monster({ name: 'Goblin 2', cr: 0.25, xp: 50 }),
      monster({ name: 'Goblin 3', cr: 0.25, xp: 50 }),
      pc({ level: 3 }),
    ]);
    expect(result.monsterCount).toBe(3);
    expect(result.totalXp).toBe(150);
    expect(result.summedCr).toBeCloseTo(0.75);
    expect(result.partyBudget).toEqual({ low: 150, moderate: 225, high: 400 });
    // 150 XP <= low budget 150 → Low.
    expect(result.band).toBe('Low');
  });

  it('falls back to xpForCr when a monster has no snapshotted xp', () => {
    const result = summarizeEncounter([monster({ cr: 1, xp: undefined }), pc({ level: 1 })]);
    expect(result.totalXp).toBe(200);
  });

  it('excludes PCs from the monster totals (ignore active players)', () => {
    const result = summarizeEncounter([
      pc({ level: 5 }),
      pc({ name: 'Legolas', level: 5 }),
      monster({ cr: 2, xp: 450 }),
    ]);
    expect(result.monsterCount).toBe(1);
    expect(result.totalXp).toBe(450);
    expect(result.summedCr).toBeCloseTo(2);
  });

  it('leaves party budget and band null when no PC has a level', () => {
    const result = summarizeEncounter([monster({ cr: 5, xp: 1800 }), pc({ level: undefined })]);
    expect(result.partyBudget).toBeNull();
    expect(result.band).toBeNull();
    expect(result.totalXp).toBe(1800);
  });

  it('rates an over-High encounter as Deadly', () => {
    // One level-1 PC: high budget 100. A CR 1 (200 XP) monster blows past it.
    const result = summarizeEncounter([monster({ cr: 1, xp: 200 }), pc({ level: 1 })]);
    expect(result.band).toBe('Deadly');
  });

  it('rates Moderate and High at the tier boundaries, and tips to Deadly one XP over High', () => {
    // Single level-5 PC: 500 / 750 / 1100.
    expect(summarizeEncounter([monster({ cr: 3, xp: 700 }), pc({ level: 5 })]).band).toBe(
      'Moderate'
    );
    expect(summarizeEncounter([monster({ cr: 4, xp: 1100 }), pc({ level: 5 })]).band).toBe('High');
    // Exactly High budget is still High; one XP over flips to Deadly.
    expect(summarizeEncounter([monster({ xp: 1100 }), pc({ level: 5 })]).band).toBe('High');
    expect(summarizeEncounter([monster({ xp: 1101 }), pc({ level: 5 })]).band).toBe('Deadly');
  });

  it('counts only stat-block-snapshotted combatants as monsters', () => {
    // A hand-typed NPC (isNpc true, no cr/xp) and a DM ally are not threats and
    // must not add a phantom xpForCr(0) to the total.
    const result = summarizeEncounter([
      monster({ cr: 1, xp: 200 }),
      { name: 'Bandit', initiative: 8, hp: 11, maxHp: 11, ac: 12, isNpc: true },
      { name: 'Wolf ally', initiative: 9, hp: 11, maxHp: 11, ac: 13, isNpc: true },
      pc({ level: 5 }),
    ]);
    expect(result.monsterCount).toBe(1);
    expect(result.totalXp).toBe(200);
  });

  it('sums the budget across mixed PC levels through summarizeEncounter', () => {
    const result = summarizeEncounter([
      monster({ cr: 1, xp: 200 }),
      pc({ name: 'L1', level: 1 }),
      pc({ name: 'L5', level: 5 }),
    ]);
    // L1 (50/75/100) + L5 (500/750/1100).
    expect(result.partyCount).toBe(2);
    expect(result.partyBudget).toEqual({ low: 550, moderate: 825, high: 1200 });
  });

  it('does not rate an empty board, even with a party present', () => {
    const result = summarizeEncounter([pc({ level: 5 }), pc({ name: 'B', level: 5 })]);
    expect(result.monsterCount).toBe(0);
    expect(result.partyBudget).not.toBeNull();
    expect(result.band).toBeNull();
  });

  it('flags action economy when monsters outnumber PCs by 3:1 or more', () => {
    const swarm = summarizeEncounter([
      ...Array.from({ length: 13 }, (_, i) => monster({ name: `Goblin ${i}`, cr: 0.25, xp: 50 })),
      pc({ level: 10 }),
    ]);
    expect(swarm.actionEconomyWarning).toBe(true);
    // The XP band itself stays RAW: 650 XP is still well under a lvl-10 low budget.
    expect(swarm.band).toBe('Low');

    // Exactly 3:1 trips it; 2:1 does not.
    expect(
      summarizeEncounter([monster(), monster({ name: 'B' }), monster({ name: 'C' }), pc()])
        .actionEconomyWarning
    ).toBe(true);
    expect(summarizeEncounter([monster(), monster({ name: 'B' }), pc()]).actionEconomyWarning).toBe(
      false
    );
  });

  it('never flags action economy without a leveled party or without monsters', () => {
    expect(
      summarizeEncounter([monster(), monster({ name: 'B' }), monster({ name: 'C' })])
        .actionEconomyWarning
    ).toBe(false); // monsters, no PC level
    expect(summarizeEncounter([pc(), pc({ name: 'B' })]).actionEconomyWarning).toBe(false); // no monsters
  });

  it('handles an empty encounter', () => {
    const result = summarizeEncounter([]);
    expect(result.monsterCount).toBe(0);
    expect(result.totalXp).toBe(0);
    expect(result.summedCr).toBe(0);
    expect(result.partyBudget).toBeNull();
    expect(result.band).toBeNull();
  });
});
