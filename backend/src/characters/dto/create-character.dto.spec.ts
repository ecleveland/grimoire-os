import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ABILITY_NAMES,
  ARMOR_TYPES,
  CONDITIONS,
  RECHARGE_KINDS,
  SKILL_NAMES,
  WEAPON_CATEGORIES,
} from '@grimoire-os/shared';
import { CreateCharacterDto } from './create-character.dto';
import { UpdateCharacterDto } from './update-character.dto';
import { GLOBAL_VALIDATION_PIPE_OPTIONS, VALIDATOR_STRICTNESS } from '../../bootstrap-config';

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

    // Gear snapshots (VEG-410): the catalog picker PATCHes inventory items
    // carrying armor/weapon metadata, so `gear` must be whitelisted end to end
    // (the VEG-349 lesson) and its shape bounded per discriminator type.
    describe('gear (VEG-410)', () => {
      it('accepts an armor gear snapshot (not rejected as unwhitelisted)', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'Chain Mail',
              quantity: 1,
              equipped: true,
              gear: {
                type: 'armor',
                armorType: 'heavy',
                baseArmorClass: 16,
                stealthDisadvantage: true,
                strengthRequirement: 13,
              },
            },
          ],
        });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
      });

      it('accepts a new shield gear snapshot carrying armorClassBonus, not baseArmorClass (VEG-461)', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'Shield',
              quantity: 1,
              equipped: true,
              gear: { type: 'armor', armorType: 'shield', armorClassBonus: 2 },
            },
          ],
        });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
      });

      it('accepts a legacy shield snapshot still carrying baseArmorClass (VEG-461 round-trip)', async () => {
        // Pre-VEG-461 shields persisted their bonus as baseArmorClass; the
        // frontend resends the whole inventory on every equip-toggle PATCH, so
        // the DTO must keep accepting that shape or those PATCHes 400.
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'Shield',
              quantity: 1,
              equipped: true,
              gear: { type: 'armor', armorType: 'shield', baseArmorClass: 2 },
            },
          ],
        });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
      });

      it('rejects a fractional or negative shield armorClassBonus (VEG-461)', async () => {
        for (const armorClassBonus of [1.5, -1]) {
          const dto = toDto({
            ...baseDto,
            inventory: [
              { name: 'X', gear: { type: 'armor', armorType: 'shield', armorClassBonus } },
            ],
          });
          const errors = await validate(dto);
          const bonus = errors
            .find(e => e.property === 'inventory')
            ?.children?.[0]?.children?.find(c => c.property === 'gear')
            ?.children?.find(c => c.property === 'armorClassBonus');
          expect(bonus?.constraints).toBeDefined();
        }
      });

      it('accepts a weapon gear snapshot (not rejected as unwhitelisted)', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'Longbow',
              quantity: 1,
              equipped: true,
              gear: {
                type: 'weapon',
                damage: '1d8',
                damageType: 'Piercing',
                properties: ['Ammunition (Range 150/600; Arrow)', 'Heavy', 'Two-Handed'],
                ranged: true,
              },
            },
          ],
        });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
      });

      // The weapon snapshot above carries no weaponCategory: it doubles as the
      // legacy-row round-trip guard (pre-VEG-463 snapshots must keep PATCHing).
      it('accepts a weapon gear snapshot carrying a weaponCategory tier (VEG-463)', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'Longsword',
              quantity: 1,
              equipped: true,
              gear: {
                type: 'weapon',
                damage: '1d8',
                damageType: 'Slashing',
                properties: ['Versatile (1d10)'],
                ranged: false,
                weaponCategory: 'martial',
              },
            },
          ],
        });
        const errors = await validate(dto, VALIDATOR_STRICTNESS);
        expect(errors.filter(e => e.property === 'inventory')).toHaveLength(0);
      });

      it('rejects an unknown weaponCategory with the isIn constraint (VEG-463)', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'X',
              gear: {
                type: 'weapon',
                damage: '1d8',
                damageType: 'Slashing',
                properties: [],
                ranged: false,
                weaponCategory: 'exotic',
              },
            },
          ],
        });
        const errors = await validate(dto);
        const category = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'weaponCategory');
        expect(category?.constraints).toHaveProperty('isIn');
      });

      it('rejects an unknown gear type with the isIn constraint', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [{ name: 'X', gear: { type: 'wand', baseArmorClass: 3 } }],
        });
        const errors = await validate(dto);
        const type = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'type');
        expect(type?.constraints).toHaveProperty('isIn');
      });

      it('rejects a fractional or negative baseArmorClass', async () => {
        for (const baseArmorClass of [2.5, -1]) {
          const dto = toDto({
            ...baseDto,
            inventory: [{ name: 'X', gear: { type: 'armor', armorType: 'light', baseArmorClass } }],
          });
          const errors = await validate(dto);
          const base = errors
            .find(e => e.property === 'inventory')
            ?.children?.[0]?.children?.find(c => c.property === 'gear')
            ?.children?.find(c => c.property === 'baseArmorClass');
          expect(base?.constraints).toBeDefined();
        }
      });

      it('rejects a fractional, negative, or absurd strengthRequirement', async () => {
        for (const strengthRequirement of [-3.7, -1, 1e308]) {
          const dto = toDto({
            ...baseDto,
            inventory: [
              {
                name: 'X',
                gear: {
                  type: 'armor',
                  armorType: 'heavy',
                  baseArmorClass: 16,
                  strengthRequirement,
                },
              },
            ],
          });
          const errors = await validate(dto);
          const str = errors
            .find(e => e.property === 'inventory')
            ?.children?.[0]?.children?.find(c => c.property === 'gear')
            ?.children?.find(c => c.property === 'strengthRequirement');
          expect(str?.constraints).toBeDefined();
        }
      });

      it('rejects armor gear missing its baseArmorClass', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [{ name: 'X', gear: { type: 'armor', armorType: 'light' } }],
        });
        const errors = await validate(dto);
        const base = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'baseArmorClass');
        expect(base?.constraints).toHaveProperty('isInt');
      });

      it('rejects armor gear with an unknown armorType', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            { name: 'X', gear: { type: 'armor', armorType: 'exotic', baseArmorClass: 12 } },
          ],
        });
        const errors = await validate(dto);
        const armorType = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'armorType');
        expect(armorType?.constraints).toHaveProperty('isIn');
      });

      it('rejects cross-branch junk: armor gear with a malformed weapon field', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'X',
              gear: {
                type: 'armor',
                armorType: 'light',
                baseArmorClass: 11,
                damage: { huge: 'object' },
              },
            },
          ],
        });
        const errors = await validate(dto);
        const damage = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'damage');
        expect(damage?.constraints).toHaveProperty('isString');
      });

      it('rejects cross-branch junk: weapon gear with a malformed armor field', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [
            {
              name: 'X',
              gear: {
                type: 'weapon',
                damage: '1d8',
                damageType: 'Slashing',
                properties: [],
                ranged: false,
                baseArmorClass: 'very high',
              },
            },
          ],
        });
        const errors = await validate(dto);
        const base = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')
          ?.children?.find(c => c.property === 'baseArmorClass');
        expect(base?.constraints).toHaveProperty('isInt');
      });

      it('rejects weapon gear missing damage fields', async () => {
        const dto = toDto({
          ...baseDto,
          inventory: [{ name: 'X', gear: { type: 'weapon', ranged: false, properties: [] } }],
        });
        const errors = await validate(dto);
        const gearErrors = errors
          .find(e => e.property === 'inventory')
          ?.children?.[0]?.children?.find(c => c.property === 'gear')?.children;
        expect(gearErrors?.find(c => c.property === 'damage')?.constraints).toHaveProperty(
          'isString'
        );
        expect(gearErrors?.find(c => c.property === 'damageType')?.constraints).toHaveProperty(
          'isString'
        );
      });
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

    it('rejects a missing, empty, or whitespace-only name', async () => {
      for (const bad of [
        { ...ki, name: undefined },
        { ...ki, name: '' },
        { ...ki, name: '   ' },
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

  describe('backgroundId (VEG-476)', () => {
    // Validated under the app's real strictness (whitelist + forbidNonWhitelisted):
    // the editor now sends backgroundId alongside the display name to disambiguate
    // duplicate-named backgrounds on load (VEG-473). A plain validate() would
    // silently accept it even if the DTO never whitelisted it (the VEG-349 trap).
    it('accepts a background id string (not rejected as unwhitelisted)', async () => {
      const dto = toDto({ ...baseDto, backgroundId: '123e4567-e89b-42d3-a456-426614174000' });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'backgroundId')).toHaveLength(0);
    });

    it('rejects a non-string backgroundId', async () => {
      const dto = toDto({ ...baseDto, backgroundId: 123 });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'backgroundId')?.constraints).toHaveProperty(
        'isString'
      );
    });

    it('accepts backgroundId: null (free-typed background clears the soft ref)', async () => {
      // The editor PATCHes null when the background is free-typed or its text is
      // edited (characterFormPayload: '' → null). @IsOptional must keep accepting
      // it if the validator is ever tightened — the clear-payloads convention.
      const dto = toDto({ ...baseDto, backgroundId: null });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'backgroundId')).toHaveLength(0);
    });
  });

  describe('autoEquipStartingGear (VEG-483)', () => {
    it('accepts a boolean', async () => {
      const dto = toDto({ ...baseDto, autoEquipStartingGear: true });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'autoEquipStartingGear')).toHaveLength(0);
    });

    it('rejects a non-boolean', async () => {
      const dto = toDto({ ...baseDto, autoEquipStartingGear: 'yes' });
      const errors = await validate(dto);
      expect(errors.find(e => e.property === 'autoEquipStartingGear')).toBeDefined();
    });

    it('is whitelisted so the guided-builder create passes forbidNonWhitelisted', async () => {
      const dto = toDto({ ...baseDto, autoEquipStartingGear: true });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'autoEquipStartingGear')).toHaveLength(0);
    });
  });

  // VEG-493. VEG-492 closed the seeded half of this drift class; these two
  // fields are the live write boundary it deferred. A typo here doesn't error —
  // `computed.skills` is keyed off the seeded ability-mappings rule, so an
  // unknown name produces no row, and the skill the caller *meant* renders
  // unproficient. Wrong numbers on the sheet, no error, no log.
  describe('skills (VEG-493)', () => {
    it('accepts canonical skill names', async () => {
      const dto = toDto({ ...baseDto, skills: ['Athletics', 'Sleight of Hand'] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'skills')).toHaveLength(0);
    });

    it('accepts an empty array', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: [] }));
      expect(errors.filter(e => e.property === 'skills')).toHaveLength(0);
    });

    it('rejects a misspelled skill name', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: ['Perceptoin'] }));
      expect(errors.find(e => e.property === 'skills')).toBeDefined();
    });

    it('names the offending skill so the 400 is self-diagnosing', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: ['Perceptoin', 'Stealth'] }));
      expect(errors.find(e => e.property === 'skills')?.constraints?.isIn).toBe(
        "skills contains unknown skill: 'Perceptoin'"
      );
    });

    it('accepts every skill in the shared catalog', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: [...SKILL_NAMES] }));
      expect(errors.filter(e => e.property === 'skills')).toHaveLength(0);
    });

    it('rejects a bare string (not an array)', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: 'Athletics' }));
      expect(errors.find(e => e.property === 'skills')?.constraints).toHaveProperty('isArray');
    });

    // Reversed after the xhigh review of PR #256. The null → [] transform was
    // added to turn Prisma's 500 into "a clean clear", but the 500 was the only
    // thing protecting the data: characters.service.update spreads `changes`
    // straight into prisma.character.update, so a null that a client emits for
    // an unset optional field silently erases every stored proficiency and
    // returns 200. Skills are durable character data, unlike `conditions`
    // (transient status), so the clear must be explicit — `[]`, not null.
    it('rejects null rather than silently clearing stored skills', async () => {
      const errors = await validate(toDto({ ...baseDto, skills: null }), VALIDATOR_STRICTNESS);
      expect(errors.find(e => e.property === 'skills')).toBeDefined();
    });

    it('accepts an explicit [] as the clear', async () => {
      const dto = toDto({ ...baseDto, skills: [] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'skills')).toHaveLength(0);
      expect(dto.skills).toEqual([]);
    });
  });

  describe('savingThrows (VEG-493)', () => {
    it('accepts canonical ability names', async () => {
      const dto = toDto({ ...baseDto, savingThrows: ['Strength', 'Constitution'] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'savingThrows')).toHaveLength(0);
    });

    it('accepts every ability in the shared catalog', async () => {
      const errors = await validate(toDto({ ...baseDto, savingThrows: [...ABILITY_NAMES] }));
      expect(errors.filter(e => e.property === 'savingThrows')).toHaveLength(0);
    });

    it('accepts an empty array', async () => {
      const errors = await validate(toDto({ ...baseDto, savingThrows: [] }));
      expect(errors.filter(e => e.property === 'savingThrows')).toHaveLength(0);
    });

    it('rejects a misspelled ability name', async () => {
      const errors = await validate(toDto({ ...baseDto, savingThrows: ['Strngth'] }));
      expect(errors.find(e => e.property === 'savingThrows')).toBeDefined();
    });

    it('rejects an abbreviated ability name (the stored form is the full name)', async () => {
      const errors = await validate(toDto({ ...baseDto, savingThrows: ['STR'] }));
      expect(errors.find(e => e.property === 'savingThrows')?.constraints?.isIn).toBe(
        "savingThrows contains unknown saving throw: 'STR'"
      );
    });

    // Same reversal as skills above — see the comment there.
    it('rejects null rather than silently clearing stored saving throws', async () => {
      const errors = await validate(
        toDto({ ...baseDto, savingThrows: null }),
        VALIDATOR_STRICTNESS
      );
      expect(errors.find(e => e.property === 'savingThrows')).toBeDefined();
    });

    it('accepts an explicit [] as the clear', async () => {
      const dto = toDto({ ...baseDto, savingThrows: [] });
      const errors = await validate(dto, VALIDATOR_STRICTNESS);
      expect(errors.filter(e => e.property === 'savingThrows')).toHaveLength(0);
      expect(dto.savingThrows).toEqual([]);
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

// `@IsIn` stores the catalog array BY REFERENCE in class-validator's global
// MetadataStorage (stashed on globalThis, so process lifetime) and re-reads it
// live on every request. A single push anywhere would therefore widen the write
// boundary for every subsequent request, permanently. `as const` is erased at
// compile time and guards nothing here — ABILITY_NAMES was mutable at runtime
// until VEG-493 froze it, and a spec proved a pushed 'Luck' became an accepted
// saving throw. Runtime assertions, because the risk is a runtime one.
describe('proficiency catalogs are immutable at runtime (VEG-493)', () => {
  // Extended after the xhigh review of PR #256: the freeze covered only the two
  // catalogs that PR touched, but the hazard is a property of *any* catalog
  // handed to @IsIn, and four siblings sit on this same DTO — CONDITIONS
  // fourteen lines below the new code. Each is `as const` only, so the exact
  // runtime-widening this block asserts against is still open for them.
  const CATALOGS: Array<[string, readonly unknown[]]> = [
    ['SKILL_NAMES', SKILL_NAMES],
    ['ABILITY_NAMES', ABILITY_NAMES],
    ['CONDITIONS', CONDITIONS],
    ['ARMOR_TYPES', ARMOR_TYPES],
    ['WEAPON_CATEGORIES', WEAPON_CATEGORIES],
    ['RECHARGE_KINDS', RECHARGE_KINDS],
  ];

  it.each(CATALOGS)('%s is frozen', (_label, catalog) => {
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it.each(CATALOGS)(
    '%s rejects a push rather than silently widening the boundary',
    (_label, catalog) => {
      const mutable = catalog as unknown as string[];
      try {
        expect(() => mutable.push('Luck')).toThrow();
        expect(catalog).not.toContain('Luck');
      } finally {
        // While this assertion is red the push *succeeds* — which is the whole
        // point — so undo it. Otherwise the widened catalog leaks into every
        // spec below through class-validator's by-reference metadata, and the
        // test that proves the boundary is open would quietly hold it open.
        const at = mutable.indexOf('Luck');
        if (at !== -1) mutable.splice(at, 1);
      }
    }
  );
});

// ── Review findings (xhigh pass on PR #256) ────────────────────────────
describe('CreateCharacterDto — proficiency write boundary, through the production pipe', () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const createMeta = { type: 'body' as const, metatype: CreateCharacterDto };
  const updateMeta = { type: 'body' as const, metatype: UpdateCharacterDto };

  // The @IsArray() guard the decorator's docstring and the specs above both
  // call load-bearing never fires for an object-shaped body: class-transformer
  // sees design:type = Array, runs `new Array()` and copies the object's
  // non-index keys, yielding []. @IsArray then passes and the catalog check is
  // trivially satisfied by an empty array. The unknown skill is accepted with a
  // 200 and the stored column is wiped — the silent drift VEG-493 exists to
  // eliminate, except destroying data rather than mis-rendering it.
  // ({"0":"Athletics"} — integer-like keys — does 400, so the hole is specific
  // to objects without them.)
  it.each([
    ['an object carrying an unknown skill', { skills: { a: 'Perceptoin' } }],
    ['an empty object', { skills: {} }],
    ['an object on savingThrows', { savingThrows: { a: 'Strngth' } }],
  ])('rejects %s rather than coercing it to an empty array', async (_label, over) => {
    await expect(
      pipe.transform({ name: 'Test Character', ...over }, createMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an object body on PATCH too (the likelier sheet-edit path)', async () => {
    await expect(
      pipe.transform({ skills: { a: 'Perceptoin' } }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// `conditions` one screen below guards against exactly this with @ArrayUnique.
// Duplicates persist to the column and CharacterEditorForm.tsx counts the
// class-skill pool with a .filter().length, so the helper text renders an
// impossible "3 of 2 chosen" against a chip list showing one chip.
describe('CreateCharacterDto — duplicate proficiencies (VEG-493 review)', () => {
  function toDto(plain: Record<string, unknown>): CreateCharacterDto {
    return plainToInstance(CreateCharacterDto, plain);
  }

  it('rejects a duplicated skill', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', skills: ['Athletics', 'Athletics'] }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.find(e => e.property === 'skills')).toBeDefined();
  });

  it('rejects a duplicated saving throw', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', savingThrows: ['Strength', 'Strength'] }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.find(e => e.property === 'savingThrows')).toBeDefined();
  });
});

// Four lines below `skills` in the same DTO, with ABILITY_NAMES already
// imported at the top of the file, and it is the ability field that actually
// feeds a computed number: computeCharacterStats resolves an unknown name to a
// null key, falls back to modifier 0, and renders a wrong-but-plausible spell
// save DC. Exactly the failure mode the fields above cite as their reason to
// exist. isKnownAbilityName() already ships in shared for this purpose.
describe('CreateCharacterDto — spellcastingAbility (VEG-493 review)', () => {
  function toDto(plain: Record<string, unknown>): CreateCharacterDto {
    return plainToInstance(CreateCharacterDto, plain);
  }

  it('accepts a canonical ability name', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', spellcastingAbility: 'Intelligence' }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.filter(e => e.property === 'spellcastingAbility')).toHaveLength(0);
  });

  it('rejects a misspelled ability name instead of computing a wrong save DC', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', spellcastingAbility: 'Inteligence' }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.find(e => e.property === 'spellcastingAbility')).toBeDefined();
  });

  it('rejects an abbreviated ability name', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', spellcastingAbility: 'INT' }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.find(e => e.property === 'spellcastingAbility')).toBeDefined();
  });

  // '' is the "not a spellcaster" value, and it is not hypothetical: ClassStep
  // sets `spellcastingAbility: selectedClass.spellcasting?.ability ?? ''` and
  // clears it to '' when the class changes, CharacterEditorForm initialises it
  // to '' and coerces a stored null to '' on load, and both send it on every
  // save. @IsOptional() skips null and undefined but NOT '', so closing this
  // catalog without allowing '' would 400 every save of every non-caster —
  // guided creation of a Fighter included. Nothing in the DTO suite would have
  // caught it; this is the 'green ≠ working' case CLAUDE.md warns about.
  it.each([
    ['the editor and guided builder default', ''],
    ['an explicit null', null],
  ])('accepts %s as "not a spellcaster"', async (_label, value) => {
    const errors = await validate(
      toDto({ name: 'Test Character', spellcastingAbility: value }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.filter(e => e.property === 'spellcastingAbility')).toHaveLength(0);
  });

  it('accepts the payload a non-caster save actually sends', async () => {
    const errors = await validate(
      toDto({
        name: 'Grunk',
        class: 'Fighter',
        spellcastingAbility: '',
        skills: ['Athletics', 'Intimidation'],
        savingThrows: ['Strength', 'Constitution'],
        proficiencies: [],
        languages: ['Common'],
        armorTraining: ['Light', 'Medium', 'Shields'],
      }),
      VALIDATOR_STRICTNESS
    );
    expect(errors).toHaveLength(0);
  });
});

// The sibling required String[] columns still take the 500 the skills/
// savingThrows transform was written to fix. With null now rejected rather than
// coerced (see the reversal above), the consistent boundary is a 400 for all of
// them — Prisma should never see a null for a non-null column.
describe('CreateCharacterDto — null on the other required array columns', () => {
  function toDto(plain: Record<string, unknown>): CreateCharacterDto {
    return plainToInstance(CreateCharacterDto, plain);
  }

  it.each([['languages'], ['proficiencies'], ['armorTraining']])(
    'rejects null for %s rather than passing it to Prisma',
    async field => {
      const errors = await validate(
        toDto({ name: 'Test Character', [field]: null }),
        VALIDATOR_STRICTNESS
      );
      expect(errors.find(e => e.property === field)).toBeDefined();
    }
  );
});

// `conditions` is the field the new code cites as its model, yet it still uses
// the bare @IsIn the new decorator exists to replace — so the repo ships two
// different rejection formats for the identical field shape. The stock message
// recites all 15 legal values and never names the typo.
describe('CreateCharacterDto — conditions message (VEG-493 review)', () => {
  function toDto(plain: Record<string, unknown>): CreateCharacterDto {
    return plainToInstance(CreateCharacterDto, plain);
  }

  it('names the offending condition rather than reciting the catalog', async () => {
    const errors = await validate(
      toDto({ name: 'Test Character', conditions: ['Poisened'] }),
      VALIDATOR_STRICTNESS
    );
    const message = Object.values(
      errors.find(e => e.property === 'conditions')?.constraints ?? {}
    ).join(' ');
    expect(message).toContain("'Poisened'");
    expect(message).not.toContain('Blinded');
  });
});

// PATCH is the likelier path for a sheet edit than POST, and UpdateCharacterDto
// reaches these constraints through two metadata-copy layers —
// PartialType(OmitType(CreateCharacterDto, …)) — where @Transform inheritance in
// particular is a @nestjs/swagger implementation detail rather than anything this
// repo controls. Worth pinning rather than assuming it keeps working across a
// dependency bump. The background spec already pins the equivalent for
// UpdateBackgroundDto.
describe('UpdateCharacterDto — inherited proficiency catalogs (VEG-493)', () => {
  function toUpdate(plain: Record<string, unknown>): UpdateCharacterDto {
    return plainToInstance(UpdateCharacterDto, plain);
  }

  it('accepts a canonical partial body', async () => {
    const errors = await validate(toUpdate({ skills: ['Perception'] }), VALIDATOR_STRICTNESS);
    expect(errors).toHaveLength(0);
  });

  it('inherits the skill catalog guard', async () => {
    const errors = await validate(toUpdate({ skills: ['Perceptoin'] }));
    expect(errors.find(e => e.property === 'skills')?.constraints?.isIn).toBe(
      "skills contains unknown skill: 'Perceptoin'"
    );
  });

  it('inherits the saving-throw catalog guard', async () => {
    const errors = await validate(toUpdate({ savingThrows: ['Strngth'] }));
    expect(errors.find(e => e.property === 'savingThrows')).toBeDefined();
  });

  // Reversed alongside the CreateCharacterDto specs above: PATCH is the likelier
  // path for the accidental null, so it matters more here than on POST.
  it('rejects null on both fields rather than clearing them', async () => {
    const errors = await validate(
      toUpdate({ skills: null, savingThrows: null }),
      VALIDATOR_STRICTNESS
    );
    expect(errors.find(e => e.property === 'skills')).toBeDefined();
    expect(errors.find(e => e.property === 'savingThrows')).toBeDefined();
  });

  it('still accepts an explicit [] clear on both fields', async () => {
    const dto = toUpdate({ skills: [], savingThrows: [] });
    const errors = await validate(dto, VALIDATOR_STRICTNESS);
    expect(errors).toHaveLength(0);
    expect(dto.skills).toEqual([]);
    expect(dto.savingThrows).toEqual([]);
  });

  // The other three non-null String[] columns get the same treatment, and for
  // the same reason: PartialType would otherwise re-open null on the PATCH path.
  it.each([['languages'], ['proficiencies'], ['armorTraining']])(
    'rejects null for %s on PATCH too',
    async field => {
      const errors = await validate(toUpdate({ [field]: null }), VALIDATOR_STRICTNESS);
      expect(errors.find(e => e.property === field)).toBeDefined();
    }
  );

  // The rejection has to read like a validation error, not like an internal
  // leak: an earlier fix routed null through a sentinel object, and the catalog
  // message duly printed it — '{"__nullRejected":true}' — in a public 400 body.
  it('describes a null rejection without leaking implementation details', async () => {
    const errors = await validate(toUpdate({ skills: null }), VALIDATOR_STRICTNESS);
    const messages = Object.values(errors.find(e => e.property === 'skills')?.constraints ?? {});

    expect(messages).toContain('skills must be an array');
    expect(messages.join(' ')).not.toContain('__nullRejected');
  });
});

// VEG-494. The constraint itself landed with VEG-493 (PR #256) — @ValidateIf +
// @IsIn(ABILITY_NAMES) on CreateCharacterDto — but only the POST path was
// pinned. PATCH reaches it through PartialType(OmitType(…)), and this is the one
// field in the DTO whose guard depends on TWO stacked CONDITIONAL_VALIDATION
// entries (@IsOptional for null/undefined, @ValidateIf for the '' non-caster
// sentinel) with PartialType re-applying a third. class-validator ANDs them, so
// all three agree today — but the block above already argues that swagger's
// metadata copying is a dependency detail worth pinning rather than assuming,
// and the two ways it could drift fail in opposite directions: dropping the
// @ValidateIf 400s every non-caster sheet save, while dropping the @IsIn
// silently restores the wrong-spell-save-DC bug on the likelier write path.
describe('UpdateCharacterDto — inherited spellcastingAbility catalog (VEG-494)', () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const updateMeta = { type: 'body' as const, metatype: UpdateCharacterDto };

  function toUpdate(plain: Record<string, unknown>): UpdateCharacterDto {
    return plainToInstance(UpdateCharacterDto, plain);
  }

  it('accepts a canonical ability name on PATCH', async () => {
    const errors = await validate(
      toUpdate({ spellcastingAbility: 'Intelligence' }),
      VALIDATOR_STRICTNESS
    );
    expect(errors).toHaveLength(0);
  });

  // Case-sensitivity is part of the contract, not an accident: @IsIn compares
  // with includes(), so a client lowercasing the value is a drift source too.
  it.each([
    ['a misspelled ability name', 'Inteligence'],
    ['an abbreviated ability name', 'INT'],
    ['a lowercased ability name', 'intelligence'],
  ])('inherits the ability catalog guard for %s', async (_label, value) => {
    const errors = await validate(toUpdate({ spellcastingAbility: value }), VALIDATOR_STRICTNESS);
    expect(errors.find(e => e.property === 'spellcastingAbility')).toBeDefined();
  });

  // Both "not a spellcaster" spellings have to survive the metadata copy.
  // CharacterEditorForm coerces a stored null to '' on load and sends '' on
  // every save; a bare null arrives from a client that serialises unset
  // optionals, and the column is nullable, so it stays a legal clear (VEG-316).
  it.each([
    ['the editor default', ''],
    ['an explicit null', null],
  ])('still accepts %s as "not a spellcaster" on PATCH', async (_label, value) => {
    const errors = await validate(toUpdate({ spellcastingAbility: value }), VALIDATOR_STRICTNESS);
    expect(errors).toHaveLength(0);
  });

  // Through the real pipe rather than the bare validator: this is the payload a
  // Fighter's sheet edit actually sends, so a regression is a 400 on every save.
  it('accepts a non-caster PATCH through the production pipe', async () => {
    await expect(
      pipe.transform({ class: 'Fighter', spellcastingAbility: '' }, updateMeta)
    ).resolves.toMatchObject({ spellcastingAbility: '' });
  });

  it('rejects a typo through the production pipe', async () => {
    await expect(
      pipe.transform({ spellcastingAbility: 'Inteligence' }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
