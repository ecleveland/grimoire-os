import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateSpellDto } from './create-spell.dto';
import { UpdateSpellDto } from './update-spell.dto';

// These run through the production pipe config (whitelist +
// forbidNonWhitelisted + implicit conversion): the DTO is the actual input
// boundary for homebrew spell writes (VEG-294), so its constraints — not the
// service backstop — are what reject malformed or ownership-injecting bodies.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateSpellDto };
const updateMeta = { type: 'body' as const, metatype: UpdateSpellDto };

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Arcane Burst',
    level: 2,
    school: 'Evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A burst of raw arcane energy.',
    ...over,
  };
}

describe('CreateSpellDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Arcane Burst', level: 2 })
    );
  });

  it('accepts a fully-populated body', async () => {
    const body = validBody({
      classes: ['Wizard', 'Sorcerer'],
      ritual: true,
      concentration: true,
      material: 'a pinch of soot',
      higherLevels: 'The damage increases by 1d8 per slot level above 2nd.',
    });

    await expect(pipe.transform(body, createMeta)).resolves.toEqual(
      expect.objectContaining({ classes: ['Wizard', 'Sorcerer'], ritual: true })
    );
  });

  it('accepts a cantrip (level 0)', async () => {
    await expect(pipe.transform(validBody({ level: 0 }), createMeta)).resolves.toEqual(
      expect.objectContaining({ level: 0 })
    );
  });

  it.each([
    ['level above 9', { level: 10 }],
    ['negative level', { level: -1 }],
    ['non-numeric level', { level: 'high' }],
    ['empty name', { name: '' }],
    ['empty school', { school: '' }],
    ['empty casting time', { castingTime: '' }],
    ['empty description', { description: '' }],
    ['non-string classes entry', { classes: [42] }],
    ['non-boolean ritual', { ritual: 'yes' }],
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

describe('UpdateSpellDto (through the production ValidationPipe)', () => {
  it('accepts a partial body', async () => {
    await expect(pipe.transform({ name: 'Greater Arcane Burst' }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Greater Arcane Burst' })
    );
  });

  it('accepts null for cleared optional fields (the VEG-316 clearing mechanism)', async () => {
    await expect(
      pipe.transform({ material: null, higherLevels: null }, updateMeta)
    ).resolves.toEqual(expect.objectContaining({ material: null, higherLevels: null }));
  });

  it('still enforces field constraints on the provided subset', async () => {
    await expect(pipe.transform({ level: 12 }, updateMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects ownership/tier injection', async () => {
    await expect(
      pipe.transform({ name: 'X', createdById: 'evil' }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
