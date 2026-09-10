// Real-DB regression test for the VEG-530 hitDice backfill.
//
// Nothing ever populated `Character.hitDice` server-side, so every character
// created through the API — and every one predating the guided builder — reached
// the sheet with a null pool. Four separate clients then invented their own d8
// for it, including the classic editor, which persisted that guess the next time
// the player saved any unrelated field and thereby silenced the VEG-528 level-up
// picker for good.
//
// The migration resolves the die through `classId` rather than re-deriving from
// the name. The VEG-528 backfill (20260909170000) already pinned an id on exactly
// the population this rule wants and left colliding and unknown names null, so
// "resolves to exactly one visible row" falls out of the join instead of being
// restated in SQL that could drift from it. That dependency is the reason this
// spec replays both migrations in order rather than pre-setting `classId`.
//
// The mocked unit suite cannot model any of this: the defect is a property of
// rows that are already persisted, and the fix is SQL.
import {
  applyMigration,
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

const CLASS_ID_MIGRATION = '20260909170000_backfill_character_class_id';
const MIGRATION_DIR = '20260909180000_backfill_character_hit_dice';

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

describe('VEG-530 hitDice backfill — real DB', () => {
  let ctx: SeedContext;

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);

    const owner = await ctx.prisma.user.create({
      data: { username: 'hitdice-owner', passwordHash: 'x', displayName: 'Owner' },
    });
    const stranger = await ctx.prisma.user.create({
      data: { username: 'hitdice-stranger', passwordHash: 'x', displayName: 'Stranger' },
    });

    const srdFighter = await ctx.prisma.srdClass.create({
      data: classRow('Fighter', { hitDie: 'd10' }),
    });
    const srdWizard = await ctx.prisma.srdClass.create({
      data: classRow('Wizard', { hitDie: 'd6' }),
    });
    ids.srdFighter = srdFighter.id;

    // The owner's own homebrew "Wizard" — the collision that leaves classId, and
    // therefore hitDice, unanswerable.
    await ctx.prisma.srdClass.create({
      data: classRow('Wizard', { contentSource: 'homebrew', createdById: owner.id, hitDie: 'd12' }),
    });

    // The other two arms of the visibility predicate. Without a character pinned
    // to each, deleting `OR sc."createdById" = c."userId"` or dropping 'shared'
    // from the IN leaves every test in this file green.
    const ownerHomebrew = await ctx.prisma.srdClass.create({
      data: classRow('Runeblade', {
        contentSource: 'homebrew',
        createdById: owner.id,
        hitDie: 'd12',
      }),
    });
    const sharedRanger = await ctx.prisma.srdClass.create({
      data: classRow('Ranger', {
        contentSource: 'shared',
        createdById: stranger.id,
        hitDie: 'd10',
      }),
    });

    // A stranger's homebrew, invisible to the owner. A character carrying its id
    // (a client can supply one; nothing validates it) must not seed from it.
    const strangerHomebrew = await ctx.prisma.srdClass.create({
      data: classRow('Bloodbinder', {
        contentSource: 'homebrew',
        createdById: stranger.id,
        hitDie: 'd12',
      }),
    });

    // A class whose die is legal for the content DTO (@IsIn(DIE_TYPES)) but is
    // not a hit die. Seeding it would write +51 a level into a permanent maximum.
    const d100Class = await ctx.prisma.srdClass.create({
      data: classRow('Dicemancer', {
        contentSource: 'shared',
        createdById: stranger.id,
        hitDie: 'd100',
      }),
    });

    const character = async (userId: string, name: string, data: Record<string, unknown>) =>
      (await ctx.prisma.character.create({ data: { name, userId, ...data } })).id;

    // Name-only, unambiguous: the classId backfill pins it, then this one seeds.
    ids.unique = await character(owner.id, 'Unique Name', { class: 'Fighter', level: 5 });
    // Already pinned by the picker, so this seeds without the first migration
    // having to do anything.
    ids.pinned = await character(owner.id, 'Already Pinned', {
      class: 'Fighter',
      classId: srdFighter.id,
      level: 1,
    });
    // Case folding is the classId backfill's job; this proves the chain carries it.
    ids.lowercase = await character(owner.id, 'Free Typed', { class: 'fighter', level: 3 });
    ids.colliding = await character(owner.id, 'Colliding Name', { class: 'Wizard', level: 4 });
    ids.unknown = await character(owner.id, 'Off Catalog', { class: 'Runecarver', level: 2 });
    ids.classless = await character(owner.id, 'No Class', { class: null, level: 6 });
    // Has a pool already, and a partly spent one — the migration must not reset it.
    ids.hasPool = await character(owner.id, 'Has Dice', {
      class: 'Fighter',
      classId: srdFighter.id,
      level: 9,
      hitDice: { dieType: 'd6', total: 4, spent: 3 },
    });
    ids.strangerScoped = await character(owner.id, 'Guessed Id', {
      class: 'Bloodbinder',
      classId: strangerHomebrew.id,
      level: 7,
    });
    ids.ownHomebrew = await character(owner.id, 'Own Homebrew', {
      class: 'Runeblade',
      classId: ownerHomebrew.id,
      level: 4,
    });
    ids.sharedTier = await character(owner.id, 'Shared Tier', {
      class: 'Ranger',
      classId: sharedRanger.id,
      level: 6,
    });
    ids.oddDie = await character(owner.id, 'Odd Die', {
      class: 'Dicemancer',
      classId: d100Class.id,
      level: 8,
    });
    // Same name, different owner, no collision in their catalog.
    ids.strangerWizard = await character(stranger.id, 'Stranger Wizard', {
      class: 'Wizard',
      classId: srdWizard.id,
      level: 2,
    });

    // Only the deliberately pre-populated character has a pool going in, so a
    // pass below cannot be mistaken for setup that was already correct.
    // Counted in JS rather than with a `where`: Prisma distinguishes a SQL NULL
    // from a JSON null on a `Json?` column, so the filter would have to name
    // `Prisma.DbNull` and would then be asserting Prisma's null semantics rather
    // than the migration's.
    const pools = await ctx.prisma.character.findMany({ select: { hitDice: true } });
    expect(pools.filter(p => p.hitDice !== null)).toHaveLength(1);

    await applyMigration(ctx.prisma, CLASS_ID_MIGRATION);
    await applyMigration(ctx.prisma, MIGRATION_DIR);
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  const hitDiceOf = async (key: string) =>
    (await ctx.prisma.character.findUniqueOrThrow({ where: { id: ids[key] } })).hitDice;

  it('seeds a full pool at the character’s level from its class die', async () => {
    expect(await hitDiceOf('unique')).toEqual({ dieType: 'd10', total: 5, spent: 0 });
  });

  it('seeds a character the picker had already pinned', async () => {
    expect(await hitDiceOf('pinned')).toEqual({ dieType: 'd10', total: 1, spent: 0 });
  });

  // Inherited from the classId backfill running first. Asserting it here is what
  // makes the ordering between the two migrations falsifiable rather than
  // assumed: swap the two applyMigration calls above and this case, the level-5
  // Fighter, and idempotence all go red.
  it('seeds a free-typed lowercase name through the id the first migration pinned', async () => {
    expect(await hitDiceOf('lowercase')).toEqual({ dieType: 'd10', total: 3, spent: 0 });
  });

  // The case with no answer. A colliding name never gets an id, so it never gets
  // a die either — the level-up picker asks the player instead.
  it('leaves a name colliding with the owner’s own homebrew alone', async () => {
    expect(await hitDiceOf('colliding')).toBeNull();
  });

  it('leaves a class that is not in the catalog alone', async () => {
    expect(await hitDiceOf('unknown')).toBeNull();
  });

  it('leaves a classless character alone', async () => {
    expect(await hitDiceOf('classless')).toBeNull();
  });

  // The pool on the sheet is the player's record, including how much of it they
  // have spent. Overwriting it would refund dice mid-adventuring-day.
  it('never overwrites a pool the character already has', async () => {
    expect(await hitDiceOf('hasPool')).toEqual({ dieType: 'd6', total: 4, spent: 3 });
  });

  // The owner-homebrew arm. Their own class is visible to them, so it seeds:
  // the mirror image of the stranger's homebrew below.
  it('seeds from the owner’s own homebrew class', async () => {
    expect(await hitDiceOf('ownHomebrew')).toEqual({ dieType: 'd12', total: 4, spent: 0 });
  });

  // The shared-tier arm. Owned by someone else, visible to everyone.
  it('seeds from a shared-tier class owned by another user', async () => {
    expect(await hitDiceOf('sharedTier')).toEqual({ dieType: 'd10', total: 6, spent: 0 });
  });

  // `classId` is a soft ref with no FK behind it, so a client can supply an id
  // for a row its owner cannot see. An unscoped join would seed this character
  // from a stranger's homebrew class.
  it('ignores a classId naming a row the owner cannot see', async () => {
    expect(await hitDiceOf('strangerScoped')).toBeNull();
  });

  // `@IsIn(DIE_TYPES)` lets a homebrew class carry d20 or d100 for the roll
  // vocabulary. Those are not hit dice, and a seeded d100 pool feeds +51 a level
  // into a permanent HP maximum.
  it('refuses a die that is not a real hit die', async () => {
    expect(await hitDiceOf('oddDie')).toBeNull();
  });

  it('resolves per owner, so a stranger’s Wizard seeds where the owner’s cannot', async () => {
    expect(await hitDiceOf('colliding')).toBeNull();
    expect(await hitDiceOf('strangerWizard')).toEqual({ dieType: 'd6', total: 2, spent: 0 });
  });

  // Migrations get replayed — by a restore, a re-run against a partially migrated
  // database, or a developer resetting locally.
  it('is idempotent: a second run changes nothing', async () => {
    const snapshot = await ctx.prisma.character.findMany({
      select: { id: true, hitDice: true },
      orderBy: { id: 'asc' },
    });

    await applyMigration(ctx.prisma, MIGRATION_DIR);

    expect(
      await ctx.prisma.character.findMany({
        select: { id: true, hitDice: true },
        orderBy: { id: 'asc' },
      })
    ).toEqual(snapshot);
  });
});
