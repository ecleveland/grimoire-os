import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateMonsterDto } from './create-monster.dto';
import { UpdateMonsterDto } from './update-monster.dto';

// These run through the production pipe config (whitelist +
// forbidNonWhitelisted + implicit conversion): the DTO is the actual input
// boundary for homebrew monster writes (VEG-293), so its constraints — not the
// service backstop — are what reject malformed or ownership-injecting bodies.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateMonsterDto };
const updateMeta = { type: 'body' as const, metatype: UpdateMonsterDto };

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Cave Troll',
    size: 'Large',
    type: 'Giant',
    armorClass: 15,
    hitPoints: 84,
    speed: '30 ft.',
    str: 18,
    dex: 13,
    con: 20,
    int: 7,
    wis: 9,
    cha: 7,
    challengeRating: 5,
    ...over,
  };
}

describe('CreateMonsterDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Cave Troll', challengeRating: 5 })
    );
  });

  it('accepts a fully-populated body with nested actions and bonus maps', async () => {
    const body = validBody({
      subtype: 'troll',
      alignment: 'chaotic evil',
      armorType: 'natural armor',
      hitDice: '8d10 + 40',
      savingThrows: { str: 7 },
      skills: { perception: 2 },
      damageResistances: ['cold'],
      senses: 'darkvision 60 ft.',
      languages: 'Giant',
      experiencePoints: 1800,
      actions: [{ name: 'Slam', description: '+7 to hit.' }],
      specialAbilities: [{ name: 'Regeneration', description: 'Regains 10 hp.' }],
      description: 'A big troll.',
    });

    await expect(pipe.transform(body, createMeta)).resolves.toEqual(
      expect.objectContaining({ subtype: 'troll', experiencePoints: 1800 })
    );
  });

  it.each([
    ['out-of-range ability score', { str: 99 }],
    ['negative armor class', { armorClass: -1 }],
    ['zero hit points', { hitPoints: 0 }],
    ['challenge rating above 30', { challengeRating: 40 }],
    ['non-numeric challenge rating', { challengeRating: 'boss' }],
    ['XP above the cap', { experiencePoints: 2_000_000 }],
    ['empty name', { name: '' }],
    ['nested action with empty name', { actions: [{ name: '', description: 'hits' }] }],
    ['nested action missing description', { actions: [{ name: 'Slam' }] }],
    ['non-string array entry', { damageResistances: [42] }],
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

describe('UpdateMonsterDto (through the production ValidationPipe)', () => {
  it('accepts a partial body', async () => {
    await expect(pipe.transform({ name: 'Bridge Troll' }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Bridge Troll' })
    );
  });

  it('accepts null for cleared optional fields (the VEG-316 clearing mechanism)', async () => {
    await expect(pipe.transform({ senses: null, savingThrows: null }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ senses: null, savingThrows: null })
    );
  });

  it('still enforces field constraints on the provided subset', async () => {
    await expect(pipe.transform({ str: 0 }, updateMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects ownership/tier injection', async () => {
    await expect(
      pipe.transform({ name: 'X', createdById: 'evil' }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
