// Real-DB regression test for the VEG-493 catalog narrowing (review of PR #256).
//
// VEG-493 replaced `@IsString({ each: true })` on the proficiency columns with a
// closed catalog and shipped no backfill, so every value already stored outside
// the catalog became a latent write block: CharacterEditorForm and BackgroundForm
// both send the full arrays on save, so one legacy entry 400s every subsequent
// edit of that row — current HP, name, notes, anything. The guided builder is
// worse: it copies a background's skillProficiencies onto the draft character and
// exposes no editor for them, so a legacy background blocks character creation
// outright with no in-wizard escape.
//
// The boundary cannot fix this — there a legacy value and a fresh typo are the
// same string — so the fix is the 20260808120000_normalize_legacy_proficiencies
// data migration, and this spec runs that migration's real SQL against real rows.
// The mocked unit suite can't model it: the defect is the interaction between a
// value that is already persisted and a boundary that no longer accepts it.
import { readFileSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../src/bootstrap-config';
import { UpdateCharacterDto } from '../../src/characters/dto/update-character.dto';
import { UpdateBackgroundDto } from '../../src/srd/dto/update-background.dto';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260808120000_normalize_legacy_proficiencies/migration.sql'
  ),
  'utf8'
);

/**
 * Split the migration into individual statements.
 *
 * `$executeRawUnsafe` sends one prepared statement per call and Postgres refuses
 * multiple commands in one ("cannot insert multiple commands into a prepared
 * statement"), so the file has to be replayed statement by statement. Comment
 * lines are stripped first: they contain apostrophes ("Thieves' Tools") that
 * would otherwise look like string delimiters to the split.
 */
function migrationStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);
}

async function applyMigration(ctx: SeedContext): Promise<void> {
  for (const statement of migrationStatements(MIGRATION_SQL)) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const characterMeta = { type: 'body' as const, metatype: UpdateCharacterDto };
const backgroundMeta = { type: 'body' as const, metatype: UpdateBackgroundDto };

// Values that were legal before VEG-493 and are still sitting in production
// columns: a tool proficiency typed into the free-text skills field, an
// abbreviated ability name, and a misspelling that rendered a wrong save DC.
const LEGACY_SKILLS = ["Thieves' Tools", 'Perception'];
const LEGACY_SAVES = ['STR', 'Constitution'];
const LEGACY_SPELL_ABILITY = 'Inteligence';

describe('pre-VEG-493 proficiency values — real DB', () => {
  let ctx: SeedContext;
  let characterId: string;
  let canonicalCharacterId: string;
  let backgroundId: string;

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);

    const user = await ctx.prisma.user.create({
      data: {
        username: 'legacy-proficiencies',
        passwordHash: 'not-a-real-hash',
        displayName: 'Legacy Owner',
      },
    });

    // Written straight through Prisma: this is the shape the API itself
    // persisted before the catalog closed.
    const character = await ctx.prisma.character.create({
      data: {
        name: 'Legacy Sheet',
        userId: user.id,
        skills: LEGACY_SKILLS,
        savingThrows: LEGACY_SAVES,
        spellcastingAbility: LEGACY_SPELL_ABILITY,
      },
    });
    characterId = character.id;

    const canonical = await ctx.prisma.character.create({
      data: {
        name: 'Already Canonical',
        userId: user.id,
        skills: ['Perception', 'Stealth'],
        savingThrows: ['Dexterity'],
        spellcastingAbility: 'Intelligence',
      },
    });
    canonicalCharacterId = canonical.id;

    const background = await ctx.prisma.background.create({
      data: {
        name: 'Legacy Gravedigger',
        skillProficiencies: ["Thieves' Tools", 'Insight'],
      },
    });
    backgroundId = background.id;

    // The rows exist and hold the legacy values — the columns never constrained
    // them. Asserted here so a failure below can't be mistaken for bad setup.
    const stored = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(stored.skills).toEqual(LEGACY_SKILLS);
    expect(stored.savingThrows).toEqual(LEGACY_SAVES);

    await applyMigration(ctx);
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('strips the non-canonical skill and keeps the canonical one', async () => {
    const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.skills).toEqual(['Perception']);
  });

  it('strips the abbreviated saving throw and keeps the full name', async () => {
    const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.savingThrows).toEqual(['Constitution']);
  });

  it('nulls a misspelled spellcastingAbility rather than guessing', async () => {
    const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.spellcastingAbility).toBeNull();
  });

  it('normalizes the background grant that feeds the guided builder', async () => {
    const row = await ctx.prisma.background.findUniqueOrThrow({ where: { id: backgroundId } });
    expect(row.skillProficiencies).toEqual(['Insight']);
  });

  it('leaves an already-canonical row untouched', async () => {
    const row = await ctx.prisma.character.findUniqueOrThrow({
      where: { id: canonicalCharacterId },
    });
    expect(row.skills).toEqual(['Perception', 'Stealth']);
    expect(row.savingThrows).toEqual(['Dexterity']);
    expect(row.spellcastingAbility).toBe('Intelligence');
  });

  // The point of the migration: the sheet's save path round-trips whatever is
  // stored, so the stored values have to be ones the boundary still accepts.
  it('leaves the character editable — a full round-trip save passes validation', async () => {
    const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });

    const sheetSave = {
      name: row.name,
      skills: row.skills,
      savingThrows: row.savingThrows,
      hitPoints: { current: 12, max: 24, temporary: 0 },
    };

    await expect(pipe.transform(sheetSave, characterMeta)).resolves.toBeDefined();
  });

  it('leaves the background editable — a rename round-trips its grants', async () => {
    const row = await ctx.prisma.background.findUniqueOrThrow({ where: { id: backgroundId } });

    await expect(
      pipe.transform(
        { name: 'Renamed Gravedigger', skillProficiencies: row.skillProficiencies },
        backgroundMeta
      )
    ).resolves.toBeDefined();
  });

  // Applied twice, the migration must not corrupt what it already fixed —
  // migrations get replayed against restored snapshots and stale environments.
  it('is idempotent', async () => {
    await applyMigration(ctx);
    const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(row.skills).toEqual(['Perception']);
    expect(row.savingThrows).toEqual(['Constitution']);
  });
});
