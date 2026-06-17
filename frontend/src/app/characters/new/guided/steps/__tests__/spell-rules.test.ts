import { describe, it, expect } from 'vitest';
import type { ClassSpellcasting, SrdSpell } from '@/lib/types';
import {
  abilityModForName,
  cantripCount,
  leveledSpellAllowance,
  toSpellEntry,
} from '../spell-rules';

const WIZARD_SC: ClassSpellcasting = {
  ability: 'Intelligence',
  cantripsKnown: { 1: 3, 4: 4 },
  preparedFormula: 'level + intelligence modifier',
};

const SORCERER_SC: ClassSpellcasting = {
  ability: 'Charisma',
  cantripsKnown: { 1: 4 },
  spellsKnown: { 1: 2, 2: 3 },
};

// Half-caster: no slots at level 1, slots from level 2 (mirrors HALF_CASTER_SLOTS).
const PALADIN_SC: ClassSpellcasting = {
  ability: 'Charisma',
  preparedFormula: 'level / 2 + charisma modifier',
  spellSlotProgression: { 1: {}, 2: { 1: 2 } },
};

const baseScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 16, // +3
  wisdom: 8, // -1
  charisma: 10, // +0
};

describe('abilityModForName', () => {
  it('maps a spellcasting ability name to its modifier', () => {
    expect(abilityModForName(baseScores, 'Intelligence')).toBe(3);
    expect(abilityModForName(baseScores, 'Wisdom')).toBe(-1);
  });

  it('returns 0 for an unknown ability name', () => {
    expect(abilityModForName(baseScores, '')).toBe(0);
  });
});

describe('cantripCount', () => {
  it('reads the cantrips-known table at the given level', () => {
    expect(cantripCount(WIZARD_SC, 1)).toBe(3);
    expect(cantripCount(SORCERER_SC, 1)).toBe(4);
  });

  it('is 0 when the class has no cantrips at that level', () => {
    expect(cantripCount(PALADIN_SC, 1)).toBe(0);
    expect(cantripCount({ ability: 'Wisdom' }, 1)).toBe(0);
  });
});

describe('leveledSpellAllowance', () => {
  it('uses the spells-known table for known casters', () => {
    expect(leveledSpellAllowance(SORCERER_SC, 1, 0)).toEqual({ count: 2, mode: 'known' });
  });

  it('evaluates "level + ability modifier" for prepared casters', () => {
    // L1 wizard, INT +3 → 1 + 3 = 4 prepared.
    expect(leveledSpellAllowance(WIZARD_SC, 1, 3)).toEqual({ count: 4, mode: 'prepared' });
  });

  it('gives a half-caster no prepared spells until it gains slots', () => {
    // L1 paladin: no slots yet → 0, despite the min-1 clamp.
    expect(leveledSpellAllowance(PALADIN_SC, 1, 2)).toEqual({ count: 0, mode: 'prepared' });
    // L2 paladin, CHA +2 → floor(2/2)=1 + 2 = 3 prepared.
    expect(leveledSpellAllowance(PALADIN_SC, 2, 2)).toEqual({ count: 3, mode: 'prepared' });
  });

  it('clamps a casting prepared caster to a minimum of 1', () => {
    // Full caster with slots but a negative mod → 1 + (-1) = 0 → clamped to 1.
    const lowMod: ClassSpellcasting = {
      ability: 'Wisdom',
      preparedFormula: 'level + wisdom modifier',
      spellSlotProgression: { 1: { 1: 2 } },
    };
    expect(leveledSpellAllowance(lowMod, 1, -1)).toEqual({ count: 1, mode: 'prepared' });
  });

  it('assumes a prepared caster with no slot data casts (min 1)', () => {
    // No spellSlotProgression → don't zero out; fall back to the formula (min 1).
    expect(
      leveledSpellAllowance(
        { ability: 'Intelligence', preparedFormula: 'level + intelligence modifier' },
        1,
        0
      )
    ).toEqual({ count: 1, mode: 'prepared' });
  });

  it('known count is taken verbatim (can be 0, e.g. L1 ranger)', () => {
    expect(leveledSpellAllowance({ ability: 'Wisdom', spellsKnown: { 1: 0 } }, 1, 3)).toEqual({
      count: 0,
      mode: 'known',
    });
  });
});

describe('toSpellEntry', () => {
  const fireBolt: SrdSpell = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Fire Bolt',
    level: 0,
    school: 'Evocation',
    castingTime: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: '…',
    classes: ['Sorcerer', 'Wizard'],
    ritual: false,
    concentration: false,
    source: 'SRD',
  };
  const web: SrdSpell = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Web',
    level: 2,
    school: 'Conjuration',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S, M (spiderweb)',
    duration: 'Concentration, up to 1 hour',
    description: '…',
    classes: ['Sorcerer', 'Wizard'],
    ritual: false,
    concentration: true,
    material: 'a bit of spiderweb',
    source: 'SRD',
  };

  it('maps catalog metadata and links the spell id; cantrips are prepared:false', () => {
    expect(toSpellEntry(fireBolt)).toEqual({
      level: 0,
      name: 'Fire Bolt',
      prepared: false,
      castingTime: '1 action',
      range: '120 feet',
      concentration: false,
      ritual: false,
      material: false,
      spellId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('leveled spells are prepared:true and derive the material flag from components', () => {
    const entry = toSpellEntry(web);
    expect(entry.prepared).toBe(true);
    expect(entry.concentration).toBe(true);
    expect(entry.material).toBe(true);
    expect(entry.level).toBe(2);
    expect(entry.spellId).toBe('22222222-2222-2222-2222-222222222222');
  });
});
