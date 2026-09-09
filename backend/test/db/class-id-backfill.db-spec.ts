// Real-DB regression test for the VEG-528 classId backfill.
//
// VEG-524 added `Character.classId` so a character could name the class row it
// actually meant, but only the class picker ever wrote it. Every character
// predating the column and every character created through the API kept a null
// id, so the protection covered almost none of the population it existed for.
// VEG-528 then made the read path REFUSE an ambiguous name rather than guessing
// a tier — which, without a backfill, would have stripped spell slots from every
// id-less "Wizard" the moment its owner authored a homebrew one.
//
// The mocked unit suite cannot model this. The defect is a property of rows that
// are already persisted, and the fix is SQL — case folding, a per-owner
// visibility join, and a HAVING that refuses to guess. This spec runs the
// migration's real SQL against real rows, the way
// character-legacy-proficiencies.db-spec.ts does for VEG-493.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260909170000_backfill_character_class_id/migration.sql'
  ),
  'utf8'
);

/**
 * Split the migration into individual statements.
 *
 * `$executeRawUnsafe` sends one prepared statement per call and Postgres refuses
 * multiple commands in one, so the file is replayed statement by statement.
 * Comment lines are stripped first: they contain apostrophes that would
 * otherwise look like string delimiters to the split.
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

// Only `name`, `hitDie` and the array columns are required; the rest default.
const classRow = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  hitDie: 'd8',
  primaryAbilities: [],
  savingThrows: [],
  armorProficiencies: [],
  weaponProficiencies: [],
  skillChoices: [],
  toolProficiencies: [],
  ...over,
});

describe('VEG-528 classId backfill — real DB', () => {
  let ctx: SeedContext;

  // Row ids captured in beforeAll so each assertion can name what it is checking.
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);

    const owner = await ctx.prisma.user.create({
      data: { username: 'classid-owner', passwordHash: 'x', displayName: 'Owner' },
    });
    const stranger = await ctx.prisma.user.create({
      data: { username: 'classid-stranger', passwordHash: 'x', displayName: 'Stranger' },
    });

    // The global catalog both users see.
    const srdFighter = await ctx.prisma.srdClass.create({
      data: classRow('Fighter', { hitDie: 'd10' }),
    });
    const srdWizard = await ctx.prisma.srdClass.create({
      data: classRow('Wizard', { hitDie: 'd6' }),
    });
    const sharedRanger = await ctx.prisma.srdClass.create({
      data: classRow('Ranger', { contentSource: 'shared', createdById: stranger.id }),
    });
    ids.srdFighter = srdFighter.id;
    ids.srdWizard = srdWizard.id;
    ids.sharedRanger = sharedRanger.id;

    // The owner's own homebrew "Wizard" — the collision the ticket is about.
    ids.ownerHomebrewWizard = (
      await ctx.prisma.srdClass.create({
        data: classRow('Wizard', {
          contentSource: 'homebrew',
          createdById: owner.id,
          hitDie: 'd12',
        }),
      })
    ).id;

    // A stranger's homebrew "Fighter". Invisible to the owner, so it must not
    // make the owner's "Fighter" ambiguous — and must never be assigned.
    ids.strangerHomebrewFighter = (
      await ctx.prisma.srdClass.create({
        data: classRow('Fighter', { contentSource: 'homebrew', createdById: stranger.id }),
      })
    ).id;

    const character = async (userId: string, name: string, data: Record<string, unknown>) =>
      (await ctx.prisma.character.create({ data: { name, userId, ...data } })).id;

    ids.unique = await character(owner.id, 'Unique Name', { class: 'Fighter' });
    ids.lowercase = await character(owner.id, 'Free Typed', { class: 'fighter' });
    ids.spaced = await character(owner.id, 'Shouty', { class: 'FIGHTER' });
    ids.colliding = await character(owner.id, 'Colliding Name', { class: 'Wizard' });
    ids.shared = await character(owner.id, 'Shared Tier', { class: 'Ranger' });
    ids.unknown = await character(owner.id, 'Off Catalog', { class: 'Bloodbinder' });
    ids.classless = await character(owner.id, 'No Class', { class: null });
    ids.blank = await character(owner.id, 'Blank Class', { class: '' });
    // Already pinned, deliberately to the "wrong" row — the backfill must not
    // second-guess an id somebody already chose.
    ids.alreadyPinned = await character(owner.id, 'Already Pinned', {
      class: 'Wizard',
      classId: srdWizard.id,
    });
    // The stranger's own Wizard has no collision in *their* catalog.
    ids.strangerWizard = await character(stranger.id, 'Stranger Wizard', { class: 'Wizard' });

    // Nothing is pinned before the migration runs, so a pass below cannot be
    // mistaken for setup that was already correct.
    const before = await ctx.prisma.character.count({ where: { classId: { not: null } } });
    expect(before).toBe(1); // only `alreadyPinned`

    await applyMigration(ctx);
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  const classIdOf = async (key: string) =>
    (await ctx.prisma.character.findUniqueOrThrow({ where: { id: ids[key] } })).classId;

  it('pins a character whose name matches exactly one visible row', async () => {
    expect(await classIdOf('unique')).toBe(ids.srdFighter);
  });

  // The case half of the divergence: before VEG-528 this character resolved on
  // the sheet (the client folds case) and matched nothing server-side.
  it('pins a free-typed lowercase name to the catalog row it names', async () => {
    expect(await classIdOf('lowercase')).toBe(ids.srdFighter);
  });

  it('pins an all-caps name too — the fold is symmetric', async () => {
    expect(await classIdOf('spaced')).toBe(ids.srdFighter);
  });

  it('pins a name that resolves to a shared-tier row', async () => {
    expect(await classIdOf('shared')).toBe(ids.sharedRanger);
  });

  // The case with no answer. Guessing here is exactly the bug VEG-524 was
  // written to remove, so the migration declines and the character keeps
  // resolving to nothing until its owner re-picks.
  it('leaves a name colliding with the owner’s own homebrew null', async () => {
    expect(await classIdOf('colliding')).toBeNull();
  });

  it('leaves a class that is not in the catalog null', async () => {
    expect(await classIdOf('unknown')).toBeNull();
  });

  it('leaves a classless character alone', async () => {
    expect(await classIdOf('classless')).toBeNull();
    expect(await classIdOf('blank')).toBeNull();
  });

  it('does not re-point a character that already has an id', async () => {
    expect(await classIdOf('alreadyPinned')).toBe(ids.srdWizard);
  });

  // The scoping property. A stranger's homebrew "Fighter" is invisible to the
  // owner, so it must neither be assigned to them nor make their unique
  // "Fighter" look ambiguous — an unscoped join would do both.
  it('ignores another user’s homebrew when counting matches', async () => {
    expect(await classIdOf('unique')).toBe(ids.srdFighter);
    expect(await classIdOf('unique')).not.toBe(ids.strangerHomebrewFighter);
  });

  // Same name, different owner, different answer: the stranger has no homebrew
  // Wizard, so theirs resolves where the owner's does not. Ambiguity is
  // per-owner, and the migration has to compute it per-owner too.
  it('resolves the same name differently for two owners with different catalogs', async () => {
    expect(await classIdOf('colliding')).toBeNull();
    expect(await classIdOf('strangerWizard')).toBe(ids.srdWizard);
  });

  // Migrations get replayed — by a restore, a re-run against a partially
  // migrated database, or a developer resetting locally.
  it('is idempotent: a second run changes nothing', async () => {
    const snapshot = await ctx.prisma.character.findMany({
      select: { id: true, classId: true },
      orderBy: { id: 'asc' },
    });

    await applyMigration(ctx);

    expect(
      await ctx.prisma.character.findMany({
        select: { id: true, classId: true },
        orderBy: { id: 'asc' },
      })
    ).toEqual(snapshot);
  });
});
