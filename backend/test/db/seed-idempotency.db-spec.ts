// Real-DB regression test for the VEG-480 upsert-by-name seed (VEG-484).
//
// seed.service.spec.ts mocks Prisma, so it can only prove the update *payload* is
// built — not that a second seed against a populated database preserves row ids,
// keeps child FKs resolving, overwrites edited fields, and inserts no duplicates.
// This spec seeds a real Postgres, mutates a parent, re-seeds, and asserts those
// four properties. A future refactor to delete-and-recreate (fresh ids) would
// pass every mocked test but fail here.
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

describe('seed idempotency — real DB (VEG-480/VEG-484)', () => {
  let ctx: SeedContext;

  // Snapshots captured after the first seed, before the mutation.
  let classId: string;
  let classHitDie: string;
  let classFeatureId: string;
  let raceId: string;
  let raceSize: string;
  let raceTraitId: string;
  let classCount: number;
  let raceCount: number;
  let classFeatureCount: number;
  let raceTraitCount: number;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma, seed } = ctx;

    await truncateAll(prisma);
    await seed.seed();

    // Discover a real parent→child pair from the data instead of hardcoding a
    // class/race name: any class that produced a feature, any race with a trait.
    const feature = await prisma.classFeature.findFirstOrThrow();
    classFeatureId = feature.id;
    const cls = await prisma.srdClass.findUniqueOrThrow({ where: { id: feature.classId } });
    classId = cls.id;
    classHitDie = cls.hitDie;

    const trait = await prisma.raceTrait.findFirstOrThrow();
    raceTraitId = trait.id;
    const race = await prisma.race.findUniqueOrThrow({ where: { id: trait.raceId } });
    raceId = race.id;
    raceSize = race.size;

    classCount = await prisma.srdClass.count();
    raceCount = await prisma.race.count();
    classFeatureCount = await prisma.classFeature.count();
    raceTraitCount = await prisma.raceTrait.count();

    // Mutate a required (always-in-the-upsert-payload) non-key field on each
    // parent so the re-seed's `update` must overwrite it back to source.
    await prisma.srdClass.update({ where: { id: classId }, data: { hitDie: 'd0-MUTATED' } });
    await prisma.race.update({ where: { id: raceId }, data: { size: 'MUTATED' } });

    await seed.seed();
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('preserves parent row ids across a re-seed (not delete-and-recreate)', async () => {
    const cls = await ctx.prisma.srdClass.findUniqueOrThrow({ where: { id: classId } });
    const race = await ctx.prisma.race.findUniqueOrThrow({ where: { id: raceId } });
    expect(cls.id).toBe(classId);
    expect(race.id).toBe(raceId);
  });

  it('overwrites an edited non-key field back to the seed source on re-seed', async () => {
    const cls = await ctx.prisma.srdClass.findUniqueOrThrow({ where: { id: classId } });
    const race = await ctx.prisma.race.findUniqueOrThrow({ where: { id: raceId } });
    expect(cls.hitDie).toBe(classHitDie);
    expect(cls.hitDie).not.toBe('d0-MUTATED');
    expect(race.size).toBe(raceSize);
    expect(race.size).not.toBe('MUTATED');
  });

  it('keeps child feature/trait FKs resolving to the same parent', async () => {
    const feature = await ctx.prisma.classFeature.findUniqueOrThrow({
      where: { id: classFeatureId },
    });
    const trait = await ctx.prisma.raceTrait.findUniqueOrThrow({ where: { id: raceTraitId } });
    expect(feature.classId).toBe(classId);
    expect(trait.raceId).toBe(raceId);
  });

  it('inserts no duplicate parent or child rows on re-seed', async () => {
    expect(await ctx.prisma.srdClass.count()).toBe(classCount);
    expect(await ctx.prisma.race.count()).toBe(raceCount);
    expect(await ctx.prisma.classFeature.count()).toBe(classFeatureCount);
    expect(await ctx.prisma.raceTrait.count()).toBe(raceTraitCount);
  });
});
