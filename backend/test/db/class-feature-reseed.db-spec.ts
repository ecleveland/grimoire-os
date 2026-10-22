// Real-DB regression test for the class and subclass feature write strategy.
//
// The seed upserts each feature row on its (parent, name, level) key and then
// deletes SRD rows the source no longer lists. seed.service.spec.ts can only
// show the `where` shapes Prisma is asked for. Whether NOT { OR: [...] } against
// the real unique index deletes exactly the stale rows, and whether the
// contentSource scoping keeps a user's homebrew class out of it, needs a real
// database.
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { loadClassFeaturesFromJson } from '../../src/seed/srd-json.loader';

const SRD_CLASS_FEATURES = 223;

describe('class and subclass feature re-seed on a real DB [VEG-619]', () => {
  let ctx: SeedContext;

  let warlockId: string;
  let mutatedId: string;
  let mutatedName: string;
  let mutatedLevel: number;
  let srdFeatureCountBefore: number;

  let brewClassId: string;
  let brewClassFeatureIds: string[];
  let brewSubclassId: string;
  let brewSubclassFeatureIds: string[];

  const srdFeatureCount = () =>
    ctx.prisma.classFeature.count({ where: { class: { contentSource: 'srd' } } });

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma, seed } = ctx;

    await truncateAll(prisma);
    await seed.seed();

    srdFeatureCountBefore = await srdFeatureCount();
    warlockId = (
      await prisma.srdClass.findFirstOrThrow({ where: { name: 'Warlock', contentSource: 'srd' } })
    ).id;

    // (a) An edited description on an SRD row, nothing else changed.
    const target = await prisma.classFeature.findFirstOrThrow({
      where: { classId: warlockId, name: 'Pact Magic', level: 1 },
    });
    mutatedId = target.id;
    mutatedName = target.name;
    mutatedLevel = target.level;
    await prisma.classFeature.update({
      where: { id: mutatedId },
      data: { description: 'MUTATED' },
    });

    // (b) Stale SRD rows an older seed would have left: a 2014 Warlock feature
    // and the 2014 name of the Fiend subclass, with a feature of its own.
    await prisma.classFeature.create({
      data: { classId: warlockId, name: 'Pact Boon', level: 3, description: 'old' },
    });
    await prisma.subclass.create({
      data: {
        name: 'The Fiend',
        classId: warlockId,
        contentSource: 'srd',
        source: 'SRD 5.2.1',
        features: {
          create: [{ name: "Dark One's Blessing", level: 3, description: 'old' }],
        },
      },
    });

    // (c) A user's homebrew class and a homebrew subclass under the SRD Warlock.
    // Neither source lists them, and neither may be touched.
    const owner = await prisma.user.create({
      data: { username: `veg619-${Date.now()}`, passwordHash: 'x', displayName: 'Owner' },
    });
    const brewClass = await prisma.srdClass.create({
      data: {
        name: `Hexblade Warden ${Date.now()}`,
        hitDie: 'd10',
        contentSource: 'homebrew',
        createdById: owner.id,
        source: 'Homebrew',
        features: {
          create: [
            { name: 'Warden Oath', level: 1, description: 'A sworn bond.' },
            { name: 'Pact Magic', level: 1, description: 'Reuses an SRD name.' },
          ],
        },
      },
      include: { features: true },
    });
    brewClassId = brewClass.id;
    brewClassFeatureIds = brewClass.features.map(f => f.id).sort();

    const brewSubclass = await prisma.subclass.create({
      data: {
        name: `Pact of the Ember ${Date.now()}`,
        classId: warlockId,
        contentSource: 'homebrew',
        createdById: owner.id,
        source: 'Homebrew',
        features: { create: [{ name: 'Ember Ward', level: 3, description: 'Warm.' }] },
      },
      include: { features: true },
    });
    brewSubclassId = brewSubclass.id;
    brewSubclassFeatureIds = brewSubclass.features.map(f => f.id);

    await seed.seed();
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('writes the edited description back to the JSON text and keeps the row id', async () => {
    const expected = loadClassFeaturesFromJson()
      .get('Warlock')!
      .features.find(f => f.name === mutatedName && f.level === mutatedLevel)!.description;

    const row = await ctx.prisma.classFeature.findFirstOrThrow({
      where: { classId: warlockId, name: mutatedName, level: mutatedLevel },
    });

    expect(row.id).toBe(mutatedId);
    expect(row.description).toBe(expected);
  });

  it('retires a stale SRD class feature the JSON does not list', async () => {
    const stale = await ctx.prisma.classFeature.findMany({
      where: { classId: warlockId, name: 'Pact Boon' },
    });
    expect(stale).toEqual([]);
  });

  it('retires a stale SRD subclass and its features', async () => {
    expect(await ctx.prisma.subclass.findMany({ where: { name: 'The Fiend' } })).toEqual([]);
    expect(await ctx.prisma.subclassFeature.count({ where: { name: "Dark One's Blessing" } })).toBe(
      0
    );
  });

  it('leaves the homebrew class and its feature ids untouched', async () => {
    const features = await ctx.prisma.classFeature.findMany({
      where: { classId: brewClassId },
      orderBy: { name: 'asc' },
    });

    expect(features.map(f => f.id).sort()).toEqual(brewClassFeatureIds);
    expect(features.map(f => f.description)).toEqual(['Reuses an SRD name.', 'A sworn bond.']);
  });

  it('leaves the homebrew subclass under the SRD Warlock and its feature ids untouched', async () => {
    const subclass = await ctx.prisma.subclass.findUniqueOrThrow({
      where: { id: brewSubclassId },
      include: { features: true },
    });

    expect(subclass.contentSource).toBe('homebrew');
    expect(subclass.features.map(f => f.id)).toEqual(brewSubclassFeatureIds);
  });

  it('records the edition of each SRD subclass in source', async () => {
    const source = async (name: string) =>
      (await ctx.prisma.subclass.findFirstOrThrow({ where: { name, contentSource: 'srd' } }))
        .source;

    expect(await source('Eldritch Knight')).toBe('SRD 5.1');
    expect(await source('Arcane Trickster')).toBe('SRD 5.1');
    expect(await source('Champion')).toBe('SRD 5.2.1');
  });

  it('holds the SRD class feature count at the JSON total before and after', async () => {
    expect(srdFeatureCountBefore).toBe(SRD_CLASS_FEATURES);
    expect(await srdFeatureCount()).toBe(SRD_CLASS_FEATURES);
  });

  it('stores a recurring feature once per level, Mystic Arcanum at 11 and 13', async () => {
    const at = (level: number) =>
      ctx.prisma.classFeature.findMany({
        where: { classId: warlockId, level },
        select: { name: true },
      });

    expect((await at(11)).map(f => f.name)).toContain('Mystic Arcanum');
    expect((await at(13)).map(f => f.name)).toContain('Mystic Arcanum');
  });
});
