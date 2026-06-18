import { describe, it, expect } from 'vitest';
import type { PartyCharacter, SrdMonster } from '@/lib/types';
import {
  dexModifier,
  rollInitiative,
  rollInitiativeMod,
  nextCombatantNames,
  parseIntField,
  buildMonsterCombatants,
  buildManualCombatant,
  buildPartyCombatants,
} from '@/lib/encounter-combatants';

function makeMonster(over: Partial<SrdMonster> = {}): SrdMonster {
  return {
    id: 'mon-goblin',
    name: 'Goblin',
    size: 'Small',
    type: 'Humanoid',
    alignment: 'neutral evil',
    armorClass: 15,
    hitPoints: 7,
    speed: '30 ft.',
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    challengeRating: 0.25,
    actions: [],
    source: 'SRD',
    ...over,
  } as SrdMonster;
}

describe('dexModifier', () => {
  it('derives the 5e DEX modifier via floor((dex - 10) / 2)', () => {
    expect(dexModifier(makeMonster({ dex: 14 }))).toBe(2);
    expect(dexModifier(makeMonster({ dex: 10 }))).toBe(0);
    expect(dexModifier(makeMonster({ dex: 8 }))).toBe(-1);
    expect(dexModifier(makeMonster({ dex: 7 }))).toBe(-2);
    expect(dexModifier(makeMonster({ dex: 30 }))).toBe(10);
  });
});

describe('rollInitiative', () => {
  it('adds a d20 roll to the DEX modifier (rng injected for determinism)', () => {
    const m = makeMonster({ dex: 14 }); // +2
    // rng returns [0,1); 0 -> d20 face 1, 0.999 -> face 20.
    expect(rollInitiative(m, () => 0)).toBe(1 + 2);
    expect(rollInitiative(m, () => 0.999)).toBe(20 + 2);
    expect(rollInitiative(m, () => 0.5)).toBe(11 + 2); // floor(0.5*20)+1 = 11
  });

  it('can roll below zero with a strong negative modifier', () => {
    const m = makeMonster({ dex: 7 }); // -2
    expect(rollInitiative(m, () => 0)).toBe(1 - 2);
  });

  it('produces independent values across successive calls with a real-ish rng', () => {
    const m = makeMonster({ dex: 10 });
    const seq = [0.1, 0.7, 0.95];
    let i = 0;
    const rng = () => seq[i++];
    expect([rollInitiative(m, rng), rollInitiative(m, rng), rollInitiative(m, rng)]).toEqual([
      3, 15, 20,
    ]);
  });
});

describe('nextCombatantNames', () => {
  it('uses the bare base name when none exists yet', () => {
    expect(nextCombatantNames([], 'Goblin', 1)).toEqual(['Goblin']);
  });

  it('numbers sequentially from 2 when the bare name is taken', () => {
    expect(nextCombatantNames(['Goblin'], 'Goblin', 1)).toEqual(['Goblin 2']);
  });

  it('returns N sequential names, skipping ones already present', () => {
    expect(nextCombatantNames([], 'Goblin', 3)).toEqual(['Goblin', 'Goblin 2', 'Goblin 3']);
    expect(nextCombatantNames(['Goblin', 'Goblin 2'], 'Goblin', 2)).toEqual([
      'Goblin 3',
      'Goblin 4',
    ]);
  });

  it('does not collide with an existing numbered entry mid-sequence', () => {
    // "Goblin 3" already taken -> first free bare is "Goblin", then skip 3.
    expect(nextCombatantNames(['Goblin 3'], 'Goblin', 3)).toEqual([
      'Goblin',
      'Goblin 2',
      'Goblin 4',
    ]);
  });

  it('is unaffected by unrelated names', () => {
    expect(nextCombatantNames(['Hero', 'Orc'], 'Goblin', 2)).toEqual(['Goblin', 'Goblin 2']);
  });
});

describe('buildMonsterCombatants', () => {
  it('pre-fills each combatant from the monster with the given initiatives', () => {
    const m = makeMonster({ armorClass: 15, hitPoints: 7, id: 'mon-goblin' });
    const result = buildMonsterCombatants(m, { quantity: 2, initiatives: [12, 9] }, []);
    expect(result).toEqual([
      {
        name: 'Goblin',
        initiative: 12,
        hp: 7,
        maxHp: 7,
        ac: 15,
        isNpc: true,
        monsterId: 'mon-goblin',
        cr: 0.25,
        xp: 50,
        initiativeMod: 2, // dex 14 → +2
      },
      {
        name: 'Goblin 2',
        initiative: 9,
        hp: 7,
        maxHp: 7,
        ac: 15,
        isNpc: true,
        monsterId: 'mon-goblin',
        cr: 0.25,
        xp: 50,
        initiativeMod: 2,
      },
    ]);
  });

  it('snapshots the DEX-based initiative modifier (VEG-370)', () => {
    expect(
      buildMonsterCombatants(makeMonster({ dex: 18 }), { quantity: 1, initiatives: [10] }, [])[0]
        .initiativeMod
    ).toBe(4);
    expect(
      buildMonsterCombatants(makeMonster({ dex: 7 }), { quantity: 1, initiatives: [10] }, [])[0]
        .initiativeMod
    ).toBe(-2);
  });

  it('snapshots cr and the CR→XP value (VEG-362), preferring the monster own xp', () => {
    const fromCr = buildMonsterCombatants(
      makeMonster({ challengeRating: 1 }),
      { quantity: 1, initiatives: [10] },
      []
    );
    expect(fromCr[0]).toMatchObject({ cr: 1, xp: 200 });

    const homebrew = buildMonsterCombatants(
      makeMonster({ challengeRating: 1, experiencePoints: 999 }),
      { quantity: 1, initiatives: [10] },
      []
    );
    expect(homebrew[0]).toMatchObject({ cr: 1, xp: 999 });
  });

  it('auto-numbers around combatants already in the encounter', () => {
    const m = makeMonster();
    const existing = ['Goblin', 'Hero'];
    const result = buildMonsterCombatants(m, { quantity: 2, initiatives: [10, 10] }, existing);
    expect(result.map(c => c.name)).toEqual(['Goblin 2', 'Goblin 3']);
  });

  it('throws when the initiatives length does not match the quantity', () => {
    const m = makeMonster();
    expect(() => buildMonsterCombatants(m, { quantity: 3, initiatives: [1, 2] }, [])).toThrow();
  });
});

describe('buildManualCombatant', () => {
  const input = {
    name: 'Animated Armor',
    initiative: 12,
    hp: 33,
    maxHp: 33,
    ac: 18,
    isNpc: true,
  };

  it('builds a combatant from the form values with no monsterId', () => {
    expect(buildManualCombatant(input, [])).toEqual({
      name: 'Animated Armor',
      initiative: 12,
      hp: 33,
      maxHp: 33,
      ac: 18,
      isNpc: true,
    });
  });

  it('auto-numbers the name against existing combatants', () => {
    expect(buildManualCombatant(input, ['Animated Armor', 'Hero']).name).toBe('Animated Armor 2');
  });

  it('trims the name before numbering', () => {
    expect(buildManualCombatant({ ...input, name: '  Animated Armor ' }, []).name).toBe(
      'Animated Armor'
    );
  });

  it('includes trimmed notes when provided', () => {
    expect(buildManualCombatant({ ...input, notes: ' lair hazard ' }, []).notes).toBe(
      'lair hazard'
    );
  });

  it('omits the notes key entirely when blank', () => {
    expect(buildManualCombatant({ ...input, notes: '   ' }, [])).not.toHaveProperty('notes');
    expect(buildManualCombatant(input, [])).not.toHaveProperty('notes');
  });

  it('passes isNpc false through for player-side combatants', () => {
    expect(buildManualCombatant({ ...input, isNpc: false }, []).isNpc).toBe(false);
  });

  it('clamps hp to maxHp so a combatant can never start above its maximum', () => {
    const c = buildManualCombatant({ ...input, hp: 50, maxHp: 10 }, []);
    expect(c.hp).toBe(10);
    expect(c.maxHp).toBe(10);
  });

  it('clamps negative hp to 0', () => {
    expect(buildManualCombatant({ ...input, hp: -5, maxHp: 10 }, []).hp).toBe(0);
  });

  it('clamps negative maxHp to 0, dragging hp with it', () => {
    const c = buildManualCombatant({ ...input, hp: 5, maxHp: -3 }, []);
    expect(c.maxHp).toBe(0);
    expect(c.hp).toBe(0);
  });
});

describe('rollInitiativeMod', () => {
  it('adds a d20 roll to the given modifier', () => {
    expect(rollInitiativeMod(2, () => 0)).toBe(1 + 2);
    expect(rollInitiativeMod(2, () => 0.999)).toBe(20 + 2);
    expect(rollInitiativeMod(-3, () => 0)).toBe(1 - 3);
  });
});

describe('buildPartyCombatants', () => {
  function makePartyCharacter(over: Partial<PartyCharacter> = {}): PartyCharacter {
    return {
      id: 'char-1',
      userId: 'user-2',
      name: 'Thia',
      race: 'Elf',
      class: 'Wizard',
      level: 5,
      armorClass: 12,
      initiative: 2,
      hitPoints: { max: 22, current: 17, temporary: 0 },
      ...over,
    };
  }

  it('snapshots name, AC, and current/max HP from the sheet with isNpc false', () => {
    const result = buildPartyCombatants(
      [{ character: makePartyCharacter(), initiative: 14 }],
      ['Goblin']
    );
    expect(result).toEqual([
      {
        name: 'Thia',
        initiative: 14,
        hp: 17,
        maxHp: 22,
        ac: 12,
        isNpc: false,
        characterId: 'char-1',
        level: 5,
      },
    ]);
  });

  it('links each PC combatant to its source characterId (VEG-256)', () => {
    const result = buildPartyCombatants(
      [
        { character: makePartyCharacter({ id: 'char-a' }), initiative: 14 },
        { character: makePartyCharacter({ id: 'char-b', name: 'Bron' }), initiative: 9 },
      ],
      []
    );
    expect(result.map(c => c.characterId)).toEqual(['char-a', 'char-b']);
  });

  it('snapshots the sheet level (VEG-362)', () => {
    const [c] = buildPartyCombatants(
      [{ character: makePartyCharacter({ level: 8 }), initiative: 12 }],
      []
    );
    expect(c.level).toBe(8);
  });

  it('clamps the snapshotted level to a whole 1–20 so the combatant write stays valid', () => {
    // The character layer does not bound level, but CombatantDto does
    // (@IsInt @Min(1) @Max(20)) — an out-of-range snapshot would 400 the write.
    const low = buildPartyCombatants(
      [{ character: makePartyCharacter({ level: 0 }), initiative: 10 }],
      []
    );
    expect(low[0].level).toBe(1);
    const high = buildPartyCombatants(
      [{ character: makePartyCharacter({ level: 25 }), initiative: 10 }],
      []
    );
    expect(high[0].level).toBe(20);
    const fractional = buildPartyCombatants(
      [{ character: makePartyCharacter({ level: 5.9 }), initiative: 10 }],
      []
    );
    expect(fractional[0].level).toBe(5);
  });

  it('omits level when the sheet value is not a finite number', () => {
    const [c] = buildPartyCombatants(
      [
        {
          character: makePartyCharacter({ level: undefined as unknown as number }),
          initiative: 10,
        },
      ],
      []
    );
    expect(c).not.toHaveProperty('level');
  });

  it('auto-numbers against existing combatants and within the batch', () => {
    const result = buildPartyCombatants(
      [
        { character: makePartyCharacter({ id: 'c1', name: 'Thia' }), initiative: 14 },
        { character: makePartyCharacter({ id: 'c2', name: 'Thia' }), initiative: 9 },
      ],
      ['Thia']
    );
    expect(result.map(c => c.name)).toEqual(['Thia 2', 'Thia 3']);
  });

  it('falls back to 10 AC / 10 HP when the sheet has no armorClass or hitPoints', () => {
    const result = buildPartyCombatants(
      [{ character: makePartyCharacter({ armorClass: null, hitPoints: null }), initiative: 10 }],
      []
    );
    expect(result[0]).toMatchObject({ ac: 10, hp: 10, maxHp: 10 });
  });

  it('clamps a stale current HP above max down to max, and negative current to 0', () => {
    const over = buildPartyCombatants(
      [
        {
          character: makePartyCharacter({ hitPoints: { max: 20, current: 31, temporary: 0 } }),
          initiative: 10,
        },
        {
          character: makePartyCharacter({
            id: 'c2',
            name: 'Mort',
            hitPoints: { max: 20, current: -4, temporary: 0 },
          }),
          initiative: 10,
        },
      ],
      []
    );
    expect(over[0]).toMatchObject({ hp: 20, maxHp: 20 });
    expect(over[1]).toMatchObject({ hp: 0, maxHp: 20 });
  });

  it('never sets monsterId on a party combatant', () => {
    const [c] = buildPartyCombatants([{ character: makePartyCharacter(), initiative: 12 }], []);
    expect(c).not.toHaveProperty('monsterId');
  });

  it('carries temporary HP from the sheet into tempHp', () => {
    const [c] = buildPartyCombatants(
      [
        {
          character: makePartyCharacter({ hitPoints: { max: 22, current: 17, temporary: 5 } }),
          initiative: 10,
        },
      ],
      []
    );
    expect(c).toMatchObject({ hp: 17, maxHp: 22, tempHp: 5 });
  });

  it('omits tempHp entirely when the sheet has none', () => {
    const [zero] = buildPartyCombatants([{ character: makePartyCharacter(), initiative: 10 }], []);
    expect(zero).not.toHaveProperty('tempHp');
    const [noHp] = buildPartyCombatants(
      [{ character: makePartyCharacter({ hitPoints: null }), initiative: 10 }],
      []
    );
    expect(noHp).not.toHaveProperty('tempHp');
  });
});

describe('parseIntField', () => {
  it('truncates finite numeric strings to integers', () => {
    expect(parseIntField('12')).toBe(12);
    expect(parseIntField('12.7')).toBe(12);
    expect(parseIntField('-3')).toBe(-3);
    expect(parseIntField('0')).toBe(0);
  });

  it('falls back to 0 for blank or non-numeric input', () => {
    expect(parseIntField('')).toBe(0);
    expect(parseIntField('   ')).toBe(0);
    expect(parseIntField('abc')).toBe(0);
    expect(parseIntField('Infinity')).toBe(0);
  });
});
