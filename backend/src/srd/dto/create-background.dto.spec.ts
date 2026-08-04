import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { CreateBackgroundDto } from './create-background.dto';
import { UpdateBackgroundDto } from './update-background.dto';

// These run through the production pipe config (whitelist +
// forbidNonWhitelisted + implicit conversion): the DTO is the actual input
// boundary for homebrew background writes (VEG-431), so its constraints — not
// the service backstop — are what reject malformed or ownership-injecting
// bodies (the VEG-349 lesson).
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const createMeta = { type: 'body' as const, metatype: CreateBackgroundDto };
const updateMeta = { type: 'body' as const, metatype: UpdateBackgroundDto };

const ORIGIN_FEAT_ID = '0d9d3d1e-9d80-4f5b-9a6e-3f6f9a1a2b3c';

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Gravedigger',
    description: 'You spent years tending the resting places of the dead.',
    ...over,
  };
}

describe('CreateBackgroundDto (through the production ValidationPipe)', () => {
  it('accepts a minimal valid body', async () => {
    await expect(pipe.transform(validBody(), createMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Gravedigger' })
    );
  });

  it('accepts a fully-populated body', async () => {
    const body = validBody({
      skillProficiencies: ['Insight', 'Religion'],
      toolProficiencies: ["Mason's Tools"],
      languages: 1,
      equipment: 'A shovel and a set of common clothes',
      personalityTraits: ['I keep quiet vigil.'],
      ideals: ['Respect. (Lawful)'],
      bonds: ['I owe the sexton everything.'],
      flaws: ['I speak to the dead more easily than the living.'],
      originFeatId: ORIGIN_FEAT_ID,
      originFeatOption: 'Cleric',
    });

    await expect(pipe.transform(body, createMeta)).resolves.toEqual(
      expect.objectContaining({
        skillProficiencies: ['Insight', 'Religion'],
        languages: 1,
        originFeatId: ORIGIN_FEAT_ID,
        originFeatOption: 'Cleric',
      })
    );
  });

  it.each([
    ['empty name', { name: '' }],
    ['non-array skillProficiencies', { skillProficiencies: 'Insight' }],
    ['non-string proficiency entry', { toolProficiencies: [42] }],
    ['negative languages', { languages: -1 }],
    ['non-integer languages', { languages: 1.5 }],
    ['non-uuid originFeatId', { originFeatId: 'alert' }],
    // VEG-493: a homebrew background feeds the guided builder's Origin step,
    // which copies skillProficiencies straight onto Character.skills — so a
    // typo here propagates into the silent unproficient-skill failure.
    ['non-canonical skillProficiencies entry', { skillProficiencies: ['Perceptoin'] }],
    ['a tool name in skillProficiencies', { skillProficiencies: ["Mason's Tools"] }],
  ])('rejects %s', async (_label, over) => {
    await expect(pipe.transform(validBody(over), createMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  // Asserts on the response payload, not the exception's own message — the
  // payload is what actually reaches the client, and BadRequestException.message
  // is always the generic 'Bad Request Exception'.
  it('names the offending skill in the 400 body (VEG-493)', async () => {
    const err = await pipe
      .transform(validBody({ skillProficiencies: ['Insight', 'Perceptoin'] }), createMeta)
      .then(
        () => null,
        (e: BadRequestException) => e
      );

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err!.getResponse() as { message: string[] }).message).toContain(
      "skillProficiencies contains unknown skill: 'Perceptoin'"
    );
  });

  it('accepts an empty skillProficiencies array', async () => {
    await expect(
      pipe.transform(validBody({ skillProficiencies: [] }), createMeta)
    ).resolves.toEqual(expect.objectContaining({ skillProficiencies: [] }));
  });

  it('still accepts free-form tool proficiencies (not a closed catalog)', async () => {
    await expect(
      pipe.transform(validBody({ toolProficiencies: ['Gravedigger’s Spade'] }), createMeta)
    ).resolves.toEqual(expect.objectContaining({ toolProficiencies: ['Gravedigger’s Spade'] }));
  });

  it.each([
    ['contentSource', { contentSource: 'shared' }],
    ['createdById', { createdById: 'someone-else' }],
    ['campaignId', { campaignId: 'camp-1' }],
    ['source', { source: 'SRD 5.2.1' }],
    ['id', { id: 'forced-id' }],
    ['features (deferred to VEG-472)', { features: [{ name: 'X', description: 'Y' }] }],
  ])('rejects ownership/tier injection via %s (forbidNonWhitelisted)', async (_label, over) => {
    await expect(pipe.transform(validBody(over), createMeta)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('UpdateBackgroundDto (through the production ValidationPipe)', () => {
  it('accepts a partial body', async () => {
    await expect(pipe.transform({ name: 'Exhumed Gravedigger' }, updateMeta)).resolves.toEqual(
      expect.objectContaining({ name: 'Exhumed Gravedigger' })
    );
  });

  it('accepts null for cleared optional fields (the VEG-316 clearing mechanism)', async () => {
    await expect(
      pipe.transform(
        { description: null, originFeatId: null, originFeatOption: null, languages: null },
        updateMeta
      )
    ).resolves.toEqual(
      expect.objectContaining({ description: null, originFeatId: null, originFeatOption: null })
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

  // PartialType makes each field optional but keeps its constraints, so the
  // catalog guard covers PATCH without a second decorator. Pinned because an
  // edit is the likelier way a bad skill reaches a stored background.
  it('inherits the skill catalog guard on update (VEG-493)', async () => {
    await expect(
      pipe.transform({ skillProficiencies: ['Perceptoin'] }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
