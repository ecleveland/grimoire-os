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
