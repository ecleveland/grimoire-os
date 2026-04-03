import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCharacterDto } from './create-character.dto';

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

  describe('all new fields optional', () => {
    it('passes validation with none of the new fields set', async () => {
      const dto = toDto(baseDto);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
