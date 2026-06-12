import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateFeatDto } from './create-feat.dto';
import { UpdateFeatDto } from './update-feat.dto';

// These run through the production pipe config (whitelist +
// forbidNonWhitelisted + implicit conversion): the DTO is the actual input
// boundary for homebrew feat writes (VEG-295), so its constraints — not the
// service backstop — are what reject malformed or ownership-injecting bodies.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateFeatDto };
const updateMeta = { type: 'body' as const, metatype: UpdateFeatDto };

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Shield Master',
    description: 'You use shields not just for protection but also for offense.',
    ...over,
  };
}

describe('CreateFeatDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Shield Master' })
    );
  });

  it('accepts a fully-populated body', async () => {
    const body = validBody({
      prerequisite: 'Level 4+',
      benefits: ['Shield Bash: You can shove with your shield.', 'Interpose: +2 to Dex saves.'],
      category: 'General',
      repeatable: true,
    });

    await expect(pipe.transform(body, createMeta)).resolves.toEqual(
      expect.objectContaining({
        prerequisite: 'Level 4+',
        benefits: ['Shield Bash: You can shove with your shield.', 'Interpose: +2 to Dex saves.'],
        category: 'General',
        repeatable: true,
      })
    );
  });

  it('keeps repeatable: false as false despite enableImplicitConversion (VEG-314 raw-body transform)', async () => {
    await expect(pipe.transform(validBody({ repeatable: false }), createMeta)).resolves.toEqual(
      expect.objectContaining({ repeatable: false })
    );
  });

  it.each([
    ['empty name', { name: '' }],
    ['empty description', { description: '' }],
    ['missing description', { description: undefined }],
    ['non-string benefits entry', { benefits: [42] }],
    ['non-array benefits', { benefits: 'one big string' }],
    ['non-boolean repeatable', { repeatable: 'yes' }],
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

describe('UpdateFeatDto (through the production ValidationPipe)', () => {
  it('accepts a partial body', async () => {
    await expect(pipe.transform({ name: 'Greater Shield Master' }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Greater Shield Master' })
    );
  });

  it('accepts null for cleared optional fields (the VEG-316 clearing mechanism)', async () => {
    await expect(
      pipe.transform({ prerequisite: null, category: null, benefits: null }, updateMeta)
    ).resolves.toEqual(
      expect.objectContaining({ prerequisite: null, category: null, benefits: null })
    );
  });

  it('still enforces field constraints on the provided subset', async () => {
    await expect(pipe.transform({ name: '' }, updateMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects ownership/tier injection', async () => {
    await expect(
      pipe.transform({ name: 'X', createdById: 'evil' }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
