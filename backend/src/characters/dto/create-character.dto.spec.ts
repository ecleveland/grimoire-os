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

  describe('level', () => {
    // VEG-411 makes level client-writable from the sheet (CharacterPatch), so
    // it needs the same boundary guards as experiencePoints: a non-integer or
    // out-of-range level 500s in Prisma instead of 400ing here.
    it('accepts levels 1 and 20', async () => {
      for (const level of [1, 20]) {
        const errors = await validate(toDto({ ...baseDto, level }));
        expect(errors.filter(e => e.property === 'level')).toHaveLength(0);
      }
    });

    it('rejects level 0 and level 21', async () => {
      for (const level of [0, 21]) {
        const errors = await validate(toDto({ ...baseDto, level }));
        expect(errors.find(e => e.property === 'level')).toBeDefined();
      }
    });

    it('rejects a non-integer level', async () => {
      const errors = await validate(toDto({ ...baseDto, level: 2.5 }));
      expect(errors.find(e => e.property === 'level')).toBeDefined();
    });
  });

  describe('experiencePoints', () => {
    // VEG-411: the sheet's Award XP control writes this on every award, so the
    // boundary must reject values Postgres int4 can't hold (or non-integers
    // like Infinity, which JSON-serializes to null and 500s in Prisma).
    it('accepts a plausible XP total', async () => {
      const dto = toDto({ ...baseDto, experiencePoints: 6500 });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'experiencePoints')).toHaveLength(0);
    });

    it('accepts the int4 maximum exactly', async () => {
      const dto = toDto({ ...baseDto, experiencePoints: 2147483647 });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'experiencePoints')).toHaveLength(0);
    });

    it('rejects a value beyond the int4 column range', async () => {
      const dto = toDto({ ...baseDto, experiencePoints: 2147483648 });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'experiencePoints')).toBeDefined();
    });

    it('rejects negative XP', async () => {
      const dto = toDto({ ...baseDto, experiencePoints: -5 });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'experiencePoints')).toBeDefined();
    });

    it('rejects a non-integer', async () => {
      const dto = toDto({ ...baseDto, experiencePoints: 6500.5 });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'experiencePoints')).toBeDefined();
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
  });

  describe('feats (VEG-430)', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted):
    // the guided builder grants an origin feat carrying featId + option, and a
    // plain validate() would silently accept it even if the DTO never whitelisted
    // the field (the VEG-349 deathSaves trap).
    it('accepts a structured origin feat with featId + option (not rejected as unwhitelisted)', async () => {
      const dto = toDto({
        ...baseDto,
        feats: [
          {
            featId: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Magic Initiate',
            option: 'Cleric',
            source: 'Acolyte',
          },
        ],
      });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'feats')).toHaveLength(0);
    });

    it('accepts a feat with only a name (featId/option optional)', async () => {
      const dto = toDto({ ...baseDto, feats: [{ name: 'Alert' }] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'feats')).toHaveLength(0);
    });

    it('rejects a feat missing the required name with the isString constraint', async () => {
      const dto = toDto({ ...baseDto, feats: [{ option: 'Cleric' }] });
      const errors = await validate(dto);
      const name = errors
        .find(e => e.property === 'feats')
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

  describe('conditions/exhaustion/concentration (VEG-408)', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted):
    // the sheet's status tracker PATCHes these fields, which a plain validate()
    // would silently accept even if never whitelisted (the VEG-349 deathSaves trap).
    describe('conditions', () => {
      it('accepts a valid SRD condition array (not rejected as unwhitelisted)', async () => {
        const dto = toDto({ ...baseDto, conditions: ['Poisoned', 'Prone'] });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'conditions')).toHaveLength(0);
      });

      it('accepts an empty array (clearing all conditions)', async () => {
        const dto = toDto({ ...baseDto, conditions: [] });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'conditions')).toHaveLength(0);
      });

      it('rejects a condition outside the SRD vocabulary with the isIn constraint', async () => {
        const dto = toDto({ ...baseDto, conditions: ['Poisoned', 'Sleepy'] });
        const errors = await validate(dto);
        const conditions = errors.find(e => e.property === 'conditions');
        expect(conditions?.constraints).toHaveProperty('isIn');
      });

      it('rejects duplicate conditions with the arrayUnique constraint', async () => {
        // Duplicates would render two identical chips with duplicate React keys,
        // and removing one would strip both (toggle filters by name).
        const dto = toDto({ ...baseDto, conditions: ['Poisoned', 'Poisoned'] });
        const errors = await validate(dto);
        const conditions = errors.find(e => e.property === 'conditions');
        expect(conditions?.constraints).toHaveProperty('arrayUnique');
      });

      it('rejects a non-array conditions value', async () => {
        const dto = toDto({ ...baseDto, conditions: 'Poisoned' });
        const errors = await validate(dto);
        expect(errors.find(e => e.property === 'conditions')).toBeDefined();
      });
    });

    describe('exhaustion', () => {
      it('accepts levels 1 through 6 (not rejected as unwhitelisted)', async () => {
        for (const level of [1, 2, 3, 4, 5, 6]) {
          const dto = toDto({ ...baseDto, exhaustion: level });
          const errors = await validate(dto, VALIDATOR_STRICTNESS);
          expect(errors.filter(e => e.property === 'exhaustion')).toHaveLength(0);
        }
      });

      it('rejects 0 with the min constraint', async () => {
        const dto = toDto({ ...baseDto, exhaustion: 0 });
        const errors = await validate(dto);
        expect(errors.find(e => e.property === 'exhaustion')?.constraints).toHaveProperty('min');
      });

      it('rejects 7 with the max constraint', async () => {
        const dto = toDto({ ...baseDto, exhaustion: 7 });
        const errors = await validate(dto);
        expect(errors.find(e => e.property === 'exhaustion')?.constraints).toHaveProperty('max');
      });

      it('rejects a non-integer level', async () => {
        const dto = toDto({ ...baseDto, exhaustion: 2.5 });
        const errors = await validate(dto);
        expect(errors.find(e => e.property === 'exhaustion')).toBeDefined();
      });
    });

    describe('clear payloads', () => {
      // The sheet stops concentrating / clears exhaustion by PATCHing null;
      // @IsOptional must keep accepting it if the validators are ever tightened.
      it('coerces conditions: null to [] (clear-all, symmetric with the other clears)', async () => {
        // Without coercion null passes @IsOptional but Prisma rejects it for
        // the required String[] — a 500 instead of a clean clear.
        const dto = toDto({ ...baseDto, conditions: null });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'conditions')).toHaveLength(0);
        expect(dto.conditions).toEqual([]);
      });

      it('accepts concentration: null (stop concentrating)', async () => {
        const dto = toDto({ ...baseDto, concentration: null });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'concentration')).toHaveLength(0);
      });

      it('accepts exhaustion: null (clear the track)', async () => {
        const dto = toDto({ ...baseDto, exhaustion: null });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'exhaustion')).toHaveLength(0);
      });
    });

    describe('concentration', () => {
      it('accepts a named spell (not rejected as unwhitelisted)', async () => {
        const dto = toDto({ ...baseDto, concentration: { spell: 'Bless' } });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'concentration')).toHaveLength(0);
      });

      it('accepts an empty object (concentrating, spell unnamed)', async () => {
        const dto = toDto({ ...baseDto, concentration: {} });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'concentration')).toHaveLength(0);
      });

      it('rejects a non-string spell name', async () => {
        const dto = toDto({ ...baseDto, concentration: { spell: 123 } });
        const errors = await validate(dto);
        expect(errors.find(e => e.property === 'concentration')).toBeDefined();
      });
    });
  });

  describe('resources (VEG-409)', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted):
    // the sheet's resource tracker PATCHes this field, which a plain validate()
    // would silently accept even if never whitelisted (the VEG-349 deathSaves trap).
    const ki = { name: 'Ki Points', max: 5, used: 2, recharge: 'short' };

    it('accepts a valid resource array (not rejected as unwhitelisted)', async () => {
      const dto = toDto({
        ...baseDto,
        resources: [ki, { name: 'Rage', max: 3, used: 0, recharge: 'long' }],
      });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'resources')).toHaveLength(0);
    });

    it('accepts an empty array (removing the last resource)', async () => {
      const dto = toDto({ ...baseDto, resources: [] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'resources')).toHaveLength(0);
    });

    it('rejects a recharge kind outside short/long', async () => {
      const dto = toDto({ ...baseDto, resources: [{ ...ki, recharge: 'dawn' }] });
      const errors = await validate(dto);
      const recharge = errors
        .find(e => e.property === 'resources')
        ?.children?.[0]?.children?.find(c => c.property === 'recharge');
      expect(recharge?.constraints).toHaveProperty('isIn');
    });

    it('rejects a missing or empty name', async () => {
      for (const bad of [
        { ...ki, name: undefined },
        { ...ki, name: '' },
      ]) {
        const dto = toDto({ ...baseDto, resources: [bad] });
        const errors = await validate(dto);
        const name = errors
          .find(e => e.property === 'resources')
          ?.children?.[0]?.children?.find(c => c.property === 'name');
        expect(name?.constraints).toBeDefined();
      }
    });

    it('rejects max outside 1–99 and non-integer max', async () => {
      for (const max of [0, 100, 2.5]) {
        const dto = toDto({ ...baseDto, resources: [{ ...ki, max }] });
        const errors = await validate(dto);
        const maxErr = errors
          .find(e => e.property === 'resources')
          ?.children?.[0]?.children?.find(c => c.property === 'max');
        expect(maxErr?.constraints).toBeDefined();
      }
    });

    it('rejects used outside 0–99 and non-integer used', async () => {
      for (const used of [-1, 100, 1.5]) {
        const dto = toDto({ ...baseDto, resources: [{ ...ki, used }] });
        const errors = await validate(dto);
        const usedErr = errors
          .find(e => e.property === 'resources')
          ?.children?.[0]?.children?.find(c => c.property === 'used');
        expect(usedErr?.constraints).toBeDefined();
      }
    });

    it('rejects used greater than max (over-consumed pool)', async () => {
      // Independently-ranged bounds would accept { max: 5, used: 50 } and the
      // sheet would render a negative remaining count — cross-field guard.
      const dto = toDto({ ...baseDto, resources: [{ ...ki, max: 5, used: 6 }] });
      const errors = await validate(dto);
      const usedErr = errors
        .find(e => e.property === 'resources')
        ?.children?.[0]?.children?.find(c => c.property === 'used');
      expect(usedErr?.constraints).toBeDefined();
    });

    it('accepts used equal to max (fully consumed pool)', async () => {
      const dto = toDto({ ...baseDto, resources: [{ ...ki, max: 5, used: 5 }] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'resources')).toHaveLength(0);
    });

    it('rejects more than 30 resources with the arrayMaxSize constraint', async () => {
      const resources = Array.from({ length: 31 }, (_, i) => ({ ...ki, name: `R${i}` }));
      const dto = toDto({ ...baseDto, resources });
      const errors = await validate(dto);
      const resourcesErr = errors.find(e => e.property === 'resources');
      expect(resourcesErr?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects a non-array resources value', async () => {
      const dto = toDto({ ...baseDto, resources: 'Ki' });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'resources')).toBeDefined();
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
