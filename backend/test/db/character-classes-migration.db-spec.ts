// Real-DB regression test for the character_classes_array migration, which folds
// the scalar `class`, `classId` and `subclass` columns into the `classes` list
// and wraps a single hit-dice object in a one-pool array.
//
// The test schema is already migrated, so the legacy columns are put back by
// hand, rows are given legacy values through raw SQL, and the migration's own
// UPDATE and DROP statements are replayed from the file. The ADD COLUMN is
// skipped because `classes` already exists. The mocked unit suite cannot model
// any of this: the defect would be a property of rows already persisted.
import {
  applyMigration,
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

const MIGRATION_DIR = '20261102120000_character_classes_array';
// Statement filters for replaying the file in parts. The ADD COLUMN is always
// skipped, because the migrated test schema already has `classes`.
const ONLY_UPDATE = /ADD COLUMN "classes"|DROP COLUMN "class"/;
const ONLY_DROP = /ADD COLUMN "classes"|^UPDATE/;

type FoldedRow = {
  name: string;
  classes: unknown;
  hitDice: unknown;
  sqlNull: boolean;
};

describe('character_classes_array migration on a real DB', () => {
  let ctx: SeedContext;
  let firstPass: FoldedRow[];
  let secondPass: FoldedRow[];
  let byName: Map<string, FoldedRow>;

  const foldedRows = () =>
    ctx.prisma.$queryRaw<FoldedRow[]>`
      SELECT name, classes, "hitDice", "hitDice" IS NULL AS "sqlNull"
      FROM "characters" ORDER BY name`;

  const dropLegacyColumns = () =>
    ctx.prisma.$executeRaw`
      ALTER TABLE "characters" DROP COLUMN IF EXISTS "class",
      DROP COLUMN IF EXISTS "classId", DROP COLUMN IF EXISTS "subclass"`;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    await prisma.$executeRaw`
      ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "class" TEXT,
      ADD COLUMN IF NOT EXISTS "classId" TEXT, ADD COLUMN IF NOT EXISTS "subclass" TEXT`;

    const owner = await prisma.user.create({
      data: { username: 'classes-migration-owner', passwordHash: 'x', displayName: 'Owner' },
    });

    // One row per case, given its legacy values after insert because Prisma
    // no longer knows the scalar columns. `hitDice` is bound as JSON text: null
    // binds SQL NULL, and the string 'null' casts to a jsonb null.
    const legacy = async (
      name: string,
      level: number,
      cls: string | null,
      classId: string | null,
      subclass: string | null,
      hitDice: string | null
    ) => {
      const { id } = await prisma.character.create({ data: { name, userId: owner.id, level } });
      await prisma.$executeRaw`
        UPDATE "characters"
        SET "class" = ${cls}, "classId" = ${classId}, "subclass" = ${subclass},
            "hitDice" = ${hitDice}::jsonb
        WHERE id = ${id}`;
    };

    await legacy(
      'Classed with id',
      5,
      'Fighter',
      'cls-srd-fighter',
      'Champion',
      '{"dieType":"d10","total":5,"spent":2}'
    );
    await legacy('Classed without id', 3, 'Wizard', null, null, null);
    await legacy('Empty class', 4, '', 'cls-orphan', null, null);
    await legacy('Whitespace class', 4, '  ', 'cls-orphan-2', null, null);
    await legacy('No class', 2, null, null, null, '{"dieType":"d8","total":2,"spent":0}');
    await legacy('Jsonb null pool', 2, 'Cleric', null, null, 'null');
    await legacy('Level zero', 0, 'Rogue', null, null, null);

    // The UPDATE twice, to show the second run changes nothing, then the DROP.
    await applyMigration(prisma, MIGRATION_DIR, { skip: ONLY_UPDATE });
    firstPass = await foldedRows();
    await applyMigration(prisma, MIGRATION_DIR, { skip: ONLY_UPDATE });
    secondPass = await foldedRows();
    await applyMigration(prisma, MIGRATION_DIR, { skip: ONLY_DROP });

    byName = new Map((await foldedRows()).map(row => [row.name, row]));
  });

  afterAll(async () => {
    // Leaves the schema as migrated even when a step above failed.
    await dropLegacyColumns();
    await truncateAll(ctx.prisma);
    await teardownSeedContext(ctx);
  });

  it('folds a classed row into one entry carrying its id and subclass', () => {
    expect(byName.get('Classed with id')?.classes).toEqual([
      {
        classId: 'cls-srd-fighter',
        name: 'Fighter',
        level: 5,
        subclass: 'Champion',
        subclassId: null,
      },
    ]);
  });

  it('wraps a stored hit-dice object in a one-pool array', () => {
    expect(byName.get('Classed with id')?.hitDice).toEqual([
      { dieType: 'd10', total: 5, spent: 2 },
    ]);
  });

  it('folds a classed row without an id, keeping its SQL NULL pool', () => {
    const row = byName.get('Classed without id');

    expect(row?.classes).toEqual([
      { classId: null, name: 'Wizard', level: 3, subclass: null, subclassId: null },
    ]);
    expect(row?.sqlNull).toBe(true);
  });

  it('treats an empty class as no class, dropping its orphaned id', () => {
    expect(byName.get('Empty class')?.classes).toEqual([]);
  });

  // A whitespace-only name would fail the entry DTO's non-blank rule, so a
  // snapshot of the folded row could never be copied or restored.
  it('treats a whitespace-only class as no class', () => {
    expect(byName.get('Whitespace class')?.classes).toEqual([]);
  });

  it('gives a row with no class an empty list and still wraps its pool', () => {
    const row = byName.get('No class');

    expect(row?.classes).toEqual([]);
    expect(row?.hitDice).toEqual([{ dieType: 'd8', total: 2, spent: 0 }]);
  });

  it('leaves a jsonb null pool as it is', () => {
    const row = byName.get('Jsonb null pool');

    expect(row?.sqlNull).toBe(false);
    expect(row?.hitDice).toBeNull();
  });

  it('floors the entry level at one for a row stored at level 0', () => {
    expect(byName.get('Level zero')?.classes).toEqual([
      { classId: null, name: 'Rogue', level: 1, subclass: null, subclassId: null },
    ]);
  });

  it('changes nothing when the UPDATE runs a second time', () => {
    expect(secondPass).toEqual(firstPass);
  });

  it('drops the scalar class columns', async () => {
    const columns = await ctx.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'characters' AND column_name IN ('class', 'classId', 'subclass')`;

    expect(columns).toEqual([]);
  });
});
