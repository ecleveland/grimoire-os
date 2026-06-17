import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCharacterDto } from './create-character.dto';
import { VALIDATOR_STRICTNESS } from '../../bootstrap-config';

describe('CreateCharacterDto — 2024 sheet fields', () => {
  const baseDto = { name: 'Test Character' };

  function toDto(plain: Record<string, unknown>): CreateCharacterDto {
    return plainToInstance(CreateCharacterDto, plain);
  }

  describe('size', () => {
    it('accepts a valid size string', async () => {
      const dto = toDto({ ...baseDto, size: 'Medium' });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'size')).toHaveLength(0);
    });

    it('rejects a non-string size', async () => {
      const dto = toDto({ ...baseDto, size: 123 });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'size')).toBeDefined();
    });
  });

  describe('heroicInspiration', () => {
    it('accepts a boolean', async () => {
      const dto = toDto({ ...baseDto, heroicInspiration: true });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'heroicInspiration')).toHaveLength(0);
    });

    it('rejects a non-boolean', async () => {
      const dto = toDto({ ...baseDto, heroicInspiration: 'yes' });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'heroicInspiration')).toBeDefined();
    });
  });

  describe('hitDice', () => {
    it('accepts a valid HitDice object', async () => {
      const dto = toDto({ ...baseDto, hitDice: { dieType: 'd10', total: 8, spent: 2 } });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'hitDice')).toHaveLength(0);
    });

    it.each(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'])(
      'accepts %s as a valid dieType',
      async dieType => {
        const dto = toDto({ ...baseDto, hitDice: { dieType, total: 1, spent: 0 } });
        const errors = await validate(dto);
        expect(errors.filter(e => e.property === 'hitDice')).toHaveLength(0);
      }
    );

    it('rejects an invalid dieType string', async () => {
      const dto = toDto({ ...baseDto, hitDice: { dieType: 'd3', total: 1, spent: 0 } });
      const errors = await validate(dto);
      const hitDiceError = errors.find(e => e.property === 'hitDice');
      expect(hitDiceError).toBeDefined();
    });

    it('rejects hitDice with invalid nested fields', async () => {
      const dto = toDto({ ...baseDto, hitDice: { dieType: 123, total: 'bad', spent: 'bad' } });
      const errors = await validate(dto);
      const hitDiceError = errors.find(e => e.property === 'hitDice');
      expect(hitDiceError).toBeDefined();
    });
  });

  describe('armorTraining', () => {
    it('accepts a string array', async () => {
      const dto = toDto({ ...baseDto, armorTraining: ['Light', 'Medium', 'Shields'] });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'armorTraining')).toHaveLength(0);
    });

    it('rejects non-string array elements', async () => {
      const dto = toDto({ ...baseDto, armorTraining: [1, 2, 3] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'armorTraining')).toBeDefined();
    });
  });

  describe('weapons', () => {
    it('accepts a valid weapons array', async () => {
      const dto = toDto({
        ...baseDto,
        weapons: [
          { name: 'Longsword', attackBonus: '+5', damage: '1d8+3', damageType: 'slashing' },
        ],
      });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'weapons')).toHaveLength(0);
    });

    it('accepts weapons with optional notes', async () => {
      const dto = toDto({
        ...baseDto,
        weapons: [
          {
            name: 'Longbow',
            attackBonus: '+7',
            damage: '1d8+4',
            damageType: 'piercing',
            notes: 'Ammunition, Heavy',
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'weapons')).toHaveLength(0);
    });

    it('rejects weapons with invalid nested fields', async () => {
      const dto = toDto({
        ...baseDto,
        weapons: [{ name: 123, attackBonus: true }],
      });
      const errors = await validate(dto);
      const weaponsError = errors.find(e => e.property === 'weapons');
      expect(weaponsError).toBeDefined();
    });
  });

  describe('spells', () => {
    it('accepts a fully-populated structured spell entry', async () => {
      const dto = toDto({
        ...baseDto,
        spells: [
          {
            level: 3,
            name: 'Fireball',
            prepared: true,
            castingTime: '1 action',
            range: '150 feet',
            concentration: false,
            ritual: false,
            material: true,
            notes: 'A tiny ball of bat guano and sulfur',
            spellId: '123e4567-e89b-42d3-a456-426614174000',
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'spells')).toHaveLength(0);
    });

    it.each([0, 9])('accepts the boundary level %s', async level => {
      const dto = toDto({ ...baseDto, spells: [{ level, name: 'Boundary' }] });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'spells')).toHaveLength(0);
    });

    it('rejects an entry missing the required name', async () => {
      const dto = toDto({ ...baseDto, spells: [{ level: 1 }] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'spells')).toBeDefined();
    });

    it.each([-1, 10, 2.5])('rejects an out-of-range / non-integer level (%s)', async level => {
      const dto = toDto({ ...baseDto, spells: [{ level, name: 'Bad' }] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'spells')).toBeDefined();
    });

    it('rejects a non-boolean concentration flag', async () => {
      const dto = toDto({ ...baseDto, spells: [{ level: 1, name: 'X', concentration: 'yes' }] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'spells')).toBeDefined();
    });

    it('rejects a non-UUID spellId', async () => {
      const dto = toDto({ ...baseDto, spells: [{ level: 1, name: 'X', spellId: 'not-a-uuid' }] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'spells')).toBeDefined();
    });
  });

  describe('attunedItems', () => {
    it('accepts up to 3 attuned items', async () => {
      const dto = toDto({
        ...baseDto,
        attunedItems: [
          { name: 'Cloak of Protection' },
          { name: 'Ring of Evasion', itemId: '123e4567-e89b-42d3-a456-426614174000' },
          { name: 'Amulet of Health' },
        ],
      });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'attunedItems')).toHaveLength(0);
    });

    it('rejects more than 3 attuned items', async () => {
      const dto = toDto({
        ...baseDto,
        attunedItems: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'attunedItems')).toBeDefined();
    });

    it('rejects an item missing the required name', async () => {
      const dto = toDto({
        ...baseDto,
        attunedItems: [{ itemId: '123e4567-e89b-42d3-a456-426614174000' }],
      });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'attunedItems')).toBeDefined();
    });

    it('rejects a non-UUID itemId', async () => {
      const dto = toDto({ ...baseDto, attunedItems: [{ name: 'X', itemId: 'nope' }] });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'attunedItems')).toBeDefined();
    });
  });

  describe('inventory', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted)
    // because the inventory CRUD controls (VEG-402) PATCH inventory with an
    // optional catalog `itemId`; a plain validate() would silently accept an
    // unwhitelisted nested field.
    it('accepts an item with an optional catalog itemId (not rejected as unwhitelisted)', async () => {
      const dto = toDto({
        ...baseDto,
        inventory: [
          {
            name: 'Ring of Evasion',
            quantity: 1,
            weight: 0,
            equipped: false,
            itemId: '123e4567-e89b-42d3-a456-426614174000',
          },
        ],
      });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
    });

    it('accepts an item with no itemId (catalog link is optional)', async () => {
      const dto = toDto({
        ...baseDto,
        inventory: [{ name: 'Torch', quantity: 5, equipped: false }],
      });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
    });

    it('rejects a non-UUID itemId with the isUuid constraint specifically', async () => {
      const dto = toDto({ ...baseDto, inventory: [{ name: 'X', itemId: 'not-a-uuid' }] });
      const errors = await validate(dto);
      const itemId = errors
        .find(e => e.property === 'inventory')
        ?.children?.[0]?.children?.find(c => c.property === 'itemId');
      expect(itemId?.constraints).toHaveProperty('isUuid');
    });

    it('rejects an item missing the required name with the isString constraint', async () => {
      const dto = toDto({ ...baseDto, inventory: [{ quantity: 1, equipped: true }] });
      const errors = await validate(dto);
      const name = errors
        .find(e => e.property === 'inventory')
        ?.children?.[0]?.children?.find(c => c.property === 'name');
      expect(name?.constraints).toHaveProperty('isString');
    });

    it('rejects a non-numeric quantity', async () => {
      const dto = toDto({ ...baseDto, inventory: [{ name: 'X', quantity: 'lots' }] });
      const errors = await validate(dto);
      const quantity = errors
        .find(e => e.property === 'inventory')
        ?.children?.[0]?.children?.find(c => c.property === 'quantity');
      expect(quantity?.constraints).toHaveProperty('isNumber');
    });
  });

  describe('deathSaves', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted)
    // because the bug was an unwhitelisted field: the in-sheet play controls
    // (VEG-349) PATCH deathSaves, which a plain validate() would silently accept.
    it('accepts a valid DeathSaves object (not rejected as unwhitelisted)', async () => {
      const dto = toDto({ ...baseDto, deathSaves: { successes: 1, failures: 2 } });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'deathSaves')).toHaveLength(0);
    });

    it('rejects a non-numeric successes value', async () => {
      const dto = toDto({ ...baseDto, deathSaves: { successes: 'x', failures: 0 } });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'deathSaves')).toBeDefined();
    });

    it('rejects successes/failures out of the 0–3 range', async () => {
      const dto = toDto({ ...baseDto, deathSaves: { successes: 5, failures: -1 } });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'deathSaves')).toBeDefined();
    });
  });

  describe('all new fields optional', () => {
    it('passes validation with none of the new fields set', async () => {
      const dto = toDto(baseDto);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
