// Regression tests for the combatant write contract (VEG-300 review): the
// global ValidationPipe runs with whitelist + forbidNonWhitelisted, so every
// property the server persists onto a combatant MUST be declared on
// CombatantDto — otherwise the first loot roll bricks all subsequent
// combatant PATCHes (the frontend echoes whole combatants back).

import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { VALIDATOR_STRICTNESS } from '../../bootstrap-config';
import { CreateEncounterDto } from './create-encounter.dto';
import { UpdateEncounterDto } from './update-encounter.dto';

const flatten = (errors: ValidationError[]): string[] =>
  errors.flatMap(e => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);

const lootCombatant = () => ({
  name: 'Wolf',
  initiative: 12,
  hp: 11,
  maxHp: 11,
  ac: 13,
  isNpc: true,
  monsterId: 'mon-1111-2222-3333-444444444444',
  loot: {
    coinage: { gp: 0, sp: 1, cp: 5 },
    items: [
      { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' },
      { itemId: 'item-1', name: 'Dagger', quantity: 2, source: 'magic-item' },
    ],
    rolledAt: '2026-06-10T00:00:00.000Z',
  },
});

describe('CombatantDto loot round-trip (global validator strictness)', () => {
  it('accepts a server-rolled loot payload echoed back through UpdateEncounterDto', () => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [lootCombatant()],
    });
    const errors = validateSync(instance, VALIDATOR_STRICTNESS);
    expect(flatten(errors)).toEqual([]);
  });

  it('accepts a loot-carrying combatant on CreateEncounterDto', () => {
    const instance = plainToInstance(CreateEncounterDto, {
      campaignId: 'camp-1',
      name: 'Ambush',
      combatants: [lootCombatant()],
    });
    const errors = validateSync(instance, VALIDATOR_STRICTNESS);
    expect(flatten(errors)).toEqual([]);
  });

  it('still accepts combatants without loot', () => {
    const combatant = lootCombatant() as Record<string, unknown>;
    delete combatant.loot;
    const instance = plainToInstance(UpdateEncounterDto, { combatants: [combatant] });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('rejects an unknown loot item source', () => {
    const combatant = lootCombatant();
    combatant.loot.items[0].source = 'stolen';
    const instance = plainToInstance(UpdateEncounterDto, { combatants: [combatant] });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).not.toEqual([]);
  });

  it('rejects non-whitelisted properties inside loot', () => {
    const combatant = lootCombatant() as { loot: Record<string, unknown> };
    combatant.loot.extra = 'nope';
    const instance = plainToInstance(UpdateEncounterDto, { combatants: [combatant] });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).not.toEqual([]);
  });

  it('rejects negative coinage', () => {
    const combatant = lootCombatant();
    combatant.loot.coinage.gp = -5;
    const instance = plainToInstance(UpdateEncounterDto, { combatants: [combatant] });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).not.toEqual([]);
  });
});

// Same write-contract concern as loot above (VEG-286): the tracker echoes
// whole combatants back on every PATCH, so tempHp must be whitelisted on
// CombatantDto or the first temp-HP grant bricks all subsequent writes.
describe('CombatantDto tempHp (global validator strictness)', () => {
  it('accepts a combatant carrying tempHp through UpdateEncounterDto', () => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), tempHp: 5 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('accepts tempHp of 0 (fully spent)', () => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), tempHp: 0 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('accepts a tempHp-carrying combatant on CreateEncounterDto', () => {
    const instance = plainToInstance(CreateEncounterDto, {
      campaignId: 'camp-1',
      name: 'Ambush',
      combatants: [{ ...lootCombatant(), tempHp: 3 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('rejects negative tempHp', () => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), tempHp: -3 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).not.toEqual([]);
  });

  it('rejects non-integer tempHp', () => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), tempHp: 2.5 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).not.toEqual([]);
  });
});

// Same write-contract concern (VEG-287): conditions, concentration, and
// exhaustion are echoed back on every PATCH, so they must be whitelisted on
// CombatantDto or the first status edit bricks all subsequent writes.
describe('CombatantDto conditions / concentration / exhaustion (global validator strictness)', () => {
  const accepts = (over: Record<string, unknown>) => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), ...over }],
    });
    return flatten(validateSync(instance, VALIDATOR_STRICTNESS));
  };

  it('accepts valid conditions, concentration, and exhaustion together', () => {
    expect(
      accepts({
        conditions: ['Poisoned', 'Prone'],
        concentration: { spell: 'Bless' },
        exhaustion: 3,
      })
    ).toEqual([]);
  });

  it('accepts these fields on CreateEncounterDto too', () => {
    const instance = plainToInstance(CreateEncounterDto, {
      campaignId: 'camp-1',
      name: 'Ambush',
      combatants: [
        { ...lootCombatant(), conditions: ['Stunned'], concentration: {}, exhaustion: 1 },
      ],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('accepts an empty conditions array and a spell-less concentration', () => {
    expect(accepts({ conditions: [], concentration: {} })).toEqual([]);
  });

  it('rejects an unknown condition name', () => {
    expect(accepts({ conditions: ['Hasted'] })).not.toEqual([]);
  });

  it('rejects exhaustion outside 1–6', () => {
    expect(accepts({ exhaustion: 0 })).not.toEqual([]);
    expect(accepts({ exhaustion: 7 })).not.toEqual([]);
    expect(accepts({ exhaustion: 2.5 })).not.toEqual([]);
  });

  it('rejects non-whitelisted properties inside concentration', () => {
    expect(accepts({ concentration: { spell: 'Bless', rounds: 10 } })).not.toEqual([]);
  });
});

// Same write-contract concern (VEG-288): death saves are echoed back on every
// PATCH, so the nested shape must be whitelisted on CombatantDto.
describe('CombatantDto deathSaves (global validator strictness)', () => {
  const accepts = (over: Record<string, unknown>) => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), ...over }],
    });
    return flatten(validateSync(instance, VALIDATOR_STRICTNESS));
  };

  it('accepts a valid death-save tally', () => {
    expect(accepts({ deathSaves: { successes: 2, failures: 1 } })).toEqual([]);
  });

  it('accepts the boundary tallies 0/0 and 3/3', () => {
    expect(accepts({ deathSaves: { successes: 0, failures: 0 } })).toEqual([]);
    expect(accepts({ deathSaves: { successes: 3, failures: 3 } })).toEqual([]);
  });

  it('accepts deathSaves on CreateEncounterDto too', () => {
    const instance = plainToInstance(CreateEncounterDto, {
      campaignId: 'camp-1',
      name: 'Ambush',
      combatants: [{ ...lootCombatant(), deathSaves: { successes: 1, failures: 0 } }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('rejects counts outside 0–3', () => {
    expect(accepts({ deathSaves: { successes: 4, failures: 0 } })).not.toEqual([]);
    expect(accepts({ deathSaves: { successes: 0, failures: -1 } })).not.toEqual([]);
  });

  it('rejects non-integer counts', () => {
    expect(accepts({ deathSaves: { successes: 1.5, failures: 0 } })).not.toEqual([]);
  });

  it('rejects a missing count (both required when present)', () => {
    expect(accepts({ deathSaves: { successes: 2 } })).not.toEqual([]);
  });

  it('rejects non-whitelisted properties inside deathSaves', () => {
    expect(accepts({ deathSaves: { successes: 1, failures: 1, rounds: 2 } })).not.toEqual([]);
  });
});

// Same write-contract concern (VEG-362): the cr/xp/level snapshots are echoed
// back on every PATCH, so they must be whitelisted on CombatantDto — otherwise
// the first difficulty-bearing write bricks all subsequent combatant PATCHes.
describe('CombatantDto cr / xp / level snapshots (global validator strictness)', () => {
  const accepts = (over: Record<string, unknown>) => {
    const instance = plainToInstance(UpdateEncounterDto, {
      combatants: [{ ...lootCombatant(), ...over }],
    });
    return flatten(validateSync(instance, VALIDATOR_STRICTNESS));
  };

  it('accepts a monster carrying cr and xp', () => {
    expect(accepts({ cr: 0.25, xp: 50 })).toEqual([]);
  });

  it('accepts cr 0 and a PC level snapshot', () => {
    expect(accepts({ cr: 0, xp: 10 })).toEqual([]);
    expect(accepts({ isNpc: false, level: 5 })).toEqual([]);
  });

  it('accepts these fields on CreateEncounterDto too', () => {
    const instance = plainToInstance(CreateEncounterDto, {
      campaignId: 'camp-1',
      name: 'Ambush',
      combatants: [{ ...lootCombatant(), cr: 2, xp: 450 }],
    });
    expect(flatten(validateSync(instance, VALIDATOR_STRICTNESS))).toEqual([]);
  });

  it('rejects a negative cr or xp', () => {
    expect(accepts({ cr: -1 })).not.toEqual([]);
    expect(accepts({ xp: -50 })).not.toEqual([]);
  });

  it('rejects a level outside 1–20 or non-integer', () => {
    expect(accepts({ level: 0 })).not.toEqual([]);
    expect(accepts({ level: 21 })).not.toEqual([]);
    expect(accepts({ level: 3.5 })).not.toEqual([]);
  });

  it('accepts an initiativeMod, including a negative one', () => {
    expect(accepts({ initiativeMod: 2 })).toEqual([]);
    expect(accepts({ initiativeMod: -1 })).toEqual([]);
  });

  // characterId (VEG-256) links a PC combatant to its character; it is echoed
  // back on every PATCH, so it must be whitelisted or the next write 400s.
  it('accepts a characterId and rejects a non-string', () => {
    expect(accepts({ characterId: 'char-1111-2222-3333-444444444444' })).toEqual([]);
    expect(accepts({ characterId: 123 })).not.toEqual([]);
  });

  it('rejects a non-integer initiativeMod', () => {
    expect(accepts({ initiativeMod: 1.5 })).not.toEqual([]);
  });
});
