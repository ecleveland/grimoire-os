import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ABILITY_NAMES, SKILL_NAMES } from '@grimoire-os/shared';
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

// ── Review findings (xhigh pass on PR #256) ────────────────────────────
describe('CreateBackgroundDto — rejection message size', () => {
  // This DTO dropped @MaxLength(100, { each: true }) alongside
  // @IsString({ each: true }), reasoning that catalog membership subsumes the
  // length bound. It does for *accepted* values; rejected ones are echoed back
  // in the message, and nothing bounds them any more. Ten 100KB entries sit
  // under the 1MB body limit and come back as a ~1MB 400.
  it('does not echo a large rejected entry back at ~1:1', async () => {
    const err = await pipe
      .transform(validBody({ skillProficiencies: ['X'.repeat(50_000)] }), createMeta)
      .then(
        () => null,
        (e: BadRequestException) => e
      );

    expect(err).toBeInstanceOf(BadRequestException);
    const body = JSON.stringify(err!.getResponse());
    expect(body.length).toBeLessThan(2_000);
  });

  it('stays bounded when the whole array is oversized', async () => {
    const err = await pipe
      .transform(
        validBody({ skillProficiencies: Array.from({ length: 10 }, () => 'X'.repeat(100_000)) }),
        createMeta
      )
      .then(
        () => null,
        (e: BadRequestException) => e
      );

    expect(err).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(err!.getResponse()).length).toBeLessThan(2_000);
  });
});

// Backgrounds written before VEG-474 replaced the free-text input with
// ToggleChips hold arbitrary strings — the DTO was @IsString({ each: true })
// and accepted anything up to 100 chars. The catalog narrowed with no backfill,
// so editing only the *name* of such a row round-trips the stored value and
// 400s, leaving the background permanently uneditable.
//
// The lockout is NOT fixable here: at this boundary a legacy stored value and a
// fresh typo are the same string, so tolerating "Thieves' Tools" on update would
// re-open the hole the 'rejects a tool name' case above closes. The fix is the
// 20260808120000_normalize_legacy_proficiencies data migration, which strips
// non-canonical entries from the stored rows; character-legacy-proficiencies
// .db-spec.ts covers it against a real database. This case pins the boundary's
// half of that contract — strict, and strict on both paths — so a later attempt
// to fix the lockout by loosening the DTO fails loudly here instead.
describe('UpdateBackgroundDto — legacy values are a migration concern, not a boundary one', () => {
  it('rejects a legacy tool name on update exactly as it does on create', async () => {
    await expect(
      pipe.transform({ name: 'Renamed', skillProficiencies: ["Thieves' Tools"] }, updateMeta)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// The migration re-types the two catalogs in SQL, where nothing type-checks them
// against the shared master copy — the exact drift VEG-492/493 exist to close,
// reintroduced one layer down. Parsing the checked-in file is the only place
// that mismatch can be caught before it silently strips real proficiencies off
// production rows.
describe('normalize_legacy_proficiencies migration', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20260808120000_normalize_legacy_proficiencies/migration.sql'
    ),
    'utf8'
  );

  // Every quoted literal inside an ARRAY[...] block, de-duplicated.
  function literalsInArrays(source: string): Set<string> {
    const found = new Set<string>();
    for (const block of source.matchAll(/ARRAY\[([^\]]*)\]/g)) {
      for (const literal of block[1].matchAll(/'((?:[^']|'')*)'/g)) {
        found.add(literal[1].replace(/''/g, "'"));
      }
    }
    return found;
  }

  it('keeps exactly the shared skill and ability catalogs, with nothing extra', () => {
    expect(literalsInArrays(sql)).toEqual(new Set([...SKILL_NAMES, ...ABILITY_NAMES]));
  });

  it('normalizes every column the catalog guards now cover', () => {
    expect(sql).toContain('"skills"');
    expect(sql).toContain('"savingThrows"');
    expect(sql).toContain('"spellcastingAbility"');
    expect(sql).toContain('"skillProficiencies"');
  });
});
