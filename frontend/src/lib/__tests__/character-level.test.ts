import { describe, expect, it } from 'vitest';
import type { ComputedXp, SrdClass } from '@/lib/types';
import {
  applyLevelUp,
  averageHpForDie,
  classFeaturesAtLevel,
  dieFaces,
  hpGain,
  MAX_LEVEL,
  xpProgressPercent,
} from '@/lib/character-level';

function srdClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'cls-1',
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: [],
    weaponProficiencies: [],
    skillChoices: [],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [
      { name: 'Second Wind', level: 1, description: 'Regain hit points.' },
      { name: 'Action Surge', level: 2, description: 'Take one additional action.' },
      { name: 'Extra Attack', level: 5 },
      { name: 'Indomitable', level: 9 },
    ],
    source: 'SRD 5.2.1',
    ...over,
  };
}

function computedXp(over: Partial<ComputedXp> = {}): ComputedXp {
  return {
    currentLevelAt: 6500,
    nextLevelAt: 14000,
    into: 3750,
    span: 7500,
    readyToLevel: false,
    ...over,
  };
}

describe('dieFaces', () => {
  it.each([
    ['d6', 6],
    ['d8', 8],
    ['d10', 10],
    ['d12', 12],
  ] as const)('%s → %i faces', (die, faces) => {
    expect(dieFaces(die)).toBe(faces);
  });
});

describe('averageHpForDie', () => {
  // Drift guard: must match the seeded hp-calculation/average-per-die rule
  // (backend/src/seed/data/game-rules.ts). A divergence here means the seed
  // table changed without this mirror being updated.
  it.each([
    ['d6', 4],
    ['d8', 5],
    ['d10', 6],
    ['d12', 7],
  ] as const)('%s → %i (matches the seeded SRD table)', (die, avg) => {
    expect(averageHpForDie(die)).toBe(avg);
  });
});

describe('hpGain', () => {
  it('adds the Constitution modifier to the base', () => {
    expect(hpGain(6, 2)).toBe(8);
    expect(hpGain(1, 0)).toBe(1);
  });

  it('clamps to a minimum of 1 per level (seeded minimumPerLevel rule)', () => {
    expect(hpGain(1, -3)).toBe(1);
    expect(hpGain(2, -2)).toBe(1);
  });
});

describe('classFeaturesAtLevel', () => {
  it('returns only the features unlocked at exactly that level, tagged with the class as source', () => {
    expect(classFeaturesAtLevel(srdClass(), 2)).toEqual([
      { name: 'Action Surge', source: 'Fighter', description: 'Take one additional action.' },
    ]);
  });

  it('omits description when the catalog feature has none', () => {
    expect(classFeaturesAtLevel(srdClass(), 5)).toEqual([
      { name: 'Extra Attack', source: 'Fighter' },
    ]);
  });

  it('returns an empty list for a level with no new features', () => {
    expect(classFeaturesAtLevel(srdClass(), 3)).toEqual([]);
  });
});

describe('xpProgressPercent', () => {
  it('reports the position within the band', () => {
    expect(xpProgressPercent(computedXp())).toBe(50);
  });

  it('clamps overshoot to 100', () => {
    expect(xpProgressPercent(computedXp({ into: 40000 }))).toBe(100);
  });

  it('is null at max level (no band)', () => {
    expect(xpProgressPercent(computedXp({ nextLevelAt: null, span: null, into: 0 }))).toBeNull();
  });
});

describe('applyLevelUp', () => {
  const character: Parameters<typeof applyLevelUp>[0] = {
    level: 5,
    hitPoints: { max: 44, current: 30, temporary: 3 },
    hitDice: { dieType: 'd10', total: 5, spent: 2 },
    features: [{ name: 'Second Wind', source: 'Fighter' }],
  };

  it('bumps level, applies the HP gain to max and current, and adds a hit die', () => {
    expect(applyLevelUp(character, { hpGain: 8, newFeatures: [] })).toEqual({
      level: 6,
      hitPoints: { max: 52, current: 38, temporary: 3 },
      hitDice: { dieType: 'd10', total: 6, spent: 2 },
    });
  });

  it('appends chosen features after the existing ones', () => {
    const patch = applyLevelUp(character, {
      hpGain: 8,
      newFeatures: [{ name: 'Extra Attack', source: 'Fighter' }],
    });
    expect(patch.features).toEqual([
      { name: 'Second Wind', source: 'Fighter' },
      { name: 'Extra Attack', source: 'Fighter' },
    ]);
  });

  it('never writes hitPoints for a character without a stored HP block', () => {
    const patch = applyLevelUp(
      { ...character, hitPoints: null },
      { hpGain: null, newFeatures: [] }
    );
    expect(patch.level).toBe(6);
    expect(patch).not.toHaveProperty('hitPoints');
  });

  it('seeds hit dice from the class hit die when the character has none', () => {
    const patch = applyLevelUp(
      { ...character, hitDice: null },
      { hpGain: 8, newFeatures: [], classHitDie: 'd10' }
    );
    // A level-6 character owns 6 hit dice, none spent.
    expect(patch.hitDice).toEqual({ dieType: 'd10', total: 6, spent: 0 });
  });

  it('falls back to d8 when seeding hit dice without a known class die', () => {
    const patch = applyLevelUp({ ...character, hitDice: null }, { hpGain: 5, newFeatures: [] });
    expect(patch.hitDice).toEqual({ dieType: 'd8', total: 6, spent: 0 });
  });

  it('omits features from the patch when nothing new was chosen', () => {
    expect(applyLevelUp(character, { hpGain: 8, newFeatures: [] })).not.toHaveProperty('features');
  });

  it('exposes the level cap the UI gates on', () => {
    expect(MAX_LEVEL).toBe(20);
  });
});
