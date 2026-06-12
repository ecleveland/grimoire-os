import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateItemDto } from './create-item.dto';
import { UpdateItemDto } from './update-item.dto';

// These run through the production pipe config (whitelist +
// forbidNonWhitelisted + implicit conversion): the DTO is the actual input
// boundary for homebrew item writes (VEG-296), so its constraints — not the
// service backstop — are what reject malformed or ownership-injecting bodies.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateItemDto };
const updateMeta = { type: 'body' as const, metatype: UpdateItemDto };

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Cloak of Whispers',
    category: 'Wondrous Item',
    ...over,
  };
}

describe('CreateItemDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Cloak of Whispers', category: 'Wondrous Item' })
    );
  });

  it('accepts a fully-populated body', async () => {
    const body = validBody({
      cost: '500 gp',
      weight: 2.5,
      description: 'A cloak woven from twilight that muffles every footstep.',
      damage: '1d4',
      damageType: 'Psychic',
      armorClass: '12 + Dex modifier',
      stealthDisadvantage: false,
      strengthRequirement: 13,
      properties: ['Finesse', 'Light'],
      rarity: 'Rare',
      requiresAttunement: true,
      isMagic: true,
    });

    await expect(pipe.transform(body, createMeta)).resolves.toEqual(
      expect.objectContaining({
        cost: '500 gp',
        weight: 2.5,
        damage: '1d4',
        armorClass: '12 + Dex modifier',
        strengthRequirement: 13,
        properties: ['Finesse', 'Light'],
        rarity: 'Rare',
        requiresAttunement: true,
        isMagic: true,
      })
    );
  });

  it.each(['stealthDisadvantage', 'requiresAttunement', 'isMagic'])(
    'keeps %s: false as false despite enableImplicitConversion (VEG-314 raw-body transform)',
    async field => {
      await expect(pipe.transform(validBody({ [field]: false }), createMeta)).resolves.toEqual(
        expect.objectContaining({ [field]: false })
      );
    }
  );

  it.each([
    ['empty name', { name: '' }],
    ['missing category', { category: undefined }],
    ['empty category', { category: '' }],
    ['non-number weight', { weight: 'heavy' }],
    ['negative weight', { weight: -1 }],
    ['non-integer strengthRequirement', { strengthRequirement: 13.5 }],
    ['non-string properties entry', { properties: [42] }],
    ['non-array properties', { properties: 'Finesse' }],
    ['non-boolean isMagic', { isMagic: 'yes' }],
  ])('rejects %s', async (_label, over) => {
    await expect(pipe.transform(validBody(over), createMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it.each([
    ['contentSource', { contentSource: 'shared' }],
    ['createdById', { createdById: 'someone-else' }],
    ['campaignId', { campaignId: 'camp-1' }],
    ['source', { source: 'SRD 5.2.1' }],
    ['id', { id: 'forced-id' }],
  ])('rejects ownership/tier injection via %s (forbidNonWhitelisted)', async (_label, over) => {
    await expect(pipe.transform(validBody(over), createMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('UpdateItemDto (through the production ValidationPipe)', () => {
  it('accepts a partial body', async () => {
    await expect(pipe.transform({ name: 'Greater Cloak' }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Greater Cloak' })
    );
  });

  it('accepts null for cleared optional fields (the VEG-316 clearing mechanism)', async () => {
    await expect(
      pipe.transform(
        { cost: null, weight: null, rarity: null, properties: null, isMagic: null },
        updateMeta
      )
    ).resolves.toEqual(
      expect.objectContaining({
        cost: null,
        weight: null,
        rarity: null,
        properties: null,
        isMagic: null,
      })
    );
  });

  it('still enforces field constraints on the provided subset', async () => {
    await expect(pipe.transform({ name: '' }, updateMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(pipe.transform({ category: '' }, updateMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects ownership/tier injection', async () => {
    await expect(
      pipe.transform({ name: 'X', createdById: 'evil' }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
