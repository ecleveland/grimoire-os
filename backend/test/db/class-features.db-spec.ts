// Real-DB regression test for per-level class features on homebrew classes
// (VEG-507). Runs via `npm run test:db` against the disposable test DB.
//
// Two things live here that cannot be proved anywhere else.
//
// The widened unique keys. `@@unique([classId, name, level])` is a database
// object; the mocked unit suite can assert what Prisma is *asked* for but never
// what the index accepts. The load-bearing case is a name recurring at several
// levels — Ability Score Improvement at 4, 8 and 12 — which the pre-VEG-507 key
// made unrepresentable and which is the reason it was widened.
//
// The visibility scoping, driven end to end. A feature row carries no
// contentSource of its own; its tier is its parent's, so every query against the
// four feature tables has to climb back to a visible parent. That rule has TWO
// encodings — a Prisma relation filter for searchFeatures/findFeaturesByIds, and
// an EXISTS subquery in the unified search's raw SQL — and a unit spec pins each
// against its own assumption. Only a real database can run both over the same
// rows and show they agree. If they ever disagree, one of them is leaking a
// user's homebrew class into everyone else's search results (VEG-335 in a new
// place), and this is the spec that fails.
import type { Cache } from 'cache-manager';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { SrdService } from '../../src/srd/srd.service';
import { HomebrewClassesService } from '../../src/srd/homebrew-classes.service';
import { ContentAccessService } from '../../src/srd/content-access.service';

const HOMEBREW_LABEL = 'Homebrew';

// The real cache is irrelevant to these assertions (SrdService only calls it
// from invalidateCache), but the constructor demands one. A no-op keeps the spec
// from depending on cache behaviour it is not testing.
// Constructed directly rather than through Nest: SeedModule provides neither
// SrdService nor a CACHE_MANAGER binding, and the cache is irrelevant to these
// assertions (SrdService touches it only in invalidateCache). A no-op keeps the
// spec from depending on cache behaviour it is not testing.
const noopCache = { clear: () => Promise.resolve() } as unknown as Cache;

describe('class features — real DB (VEG-507)', () => {
  let ctx: SeedContext;
  let srd: SrdService;
  let homebrewClasses: HomebrewClassesService;

  let ownerId: string;
  let strangerId: string;
  let srdClassId: string;

  // The owner's homebrew class and the features hanging off it. This is the row
  // set every leak assertion below is about.
  let brewClassId: string;
  let brewFeatureIds: string[];
  const BREW_FEATURE_NAME = 'Veg507 Wardens Bond';

  // The other three tiered parents, so every branch of the visibility rule has a
  // row that distinguishes it. Without these the subclass and background
  // branches of the raw-SQL gate were asserted only by the table name appearing
  // in the generated string, which is true whether or not the tier is checked.
  const SUBCLASS_FEATURE_NAME = 'Veg507 Ashen Step';
  const GRANDPARENT_FEATURE_NAME = 'Veg507 Buried Rite';
  const BACKGROUND_FEATURE_NAME = 'Veg507 Guild Writ';

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);
    await ctx.seed.seed();

    srd = new SrdService(ctx.prisma, new ContentAccessService(), noopCache);

    const [owner, stranger] = await Promise.all([
      ctx.prisma.user.create({
        data: { username: `veg507-owner-${Date.now()}`, passwordHash: 'x', displayName: 'Owner' },
      }),
      ctx.prisma.user.create({
        data: { username: `veg507-other-${Date.now()}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    ownerId = owner.id;
    strangerId = stranger.id;

    srdClassId = (await ctx.prisma.srdClass.findFirstOrThrow({ where: { contentSource: 'srd' } }))
      .id;

    const brew = await ctx.prisma.srdClass.create({
      data: {
        name: `Warden ${Date.now()}`,
        hitDie: 'd10',
        contentSource: 'homebrew',
        createdById: ownerId,
        source: HOMEBREW_LABEL,
        features: {
          create: [
            { name: BREW_FEATURE_NAME, level: 1, description: 'A sworn bond to wild places.' },
            { name: 'Ability Score Improvement', level: 4, description: 'Raise two scores.' },
            { name: 'Ability Score Improvement', level: 8, description: 'Raise two scores.' },
          ],
        },
      },
      include: { features: true },
    });
    brewClassId = brew.id;
    brewFeatureIds = brew.features.map(f => f.id);

    homebrewClasses = new HomebrewClassesService(ctx.prisma, new ContentAccessService());

    // Hop 1: a homebrew subclass under an SRD class. Its own tier is what hides
    // it; the parent is visible to everyone.
    await ctx.prisma.subclass.create({
      data: {
        name: `Path of Ash ${Date.now()}`,
        classId: srdClassId,
        contentSource: 'homebrew',
        createdById: ownerId,
        source: HOMEBREW_LABEL,
        features: {
          create: [{ name: SUBCLASS_FEATURE_NAME, level: 3, description: 'Step through cinders.' }],
        },
      },
    });

    // Hop 2, and the only reason the grandparent check exists: a globally
    // visible subclass hanging off a class only its owner can see. Its own tier
    // says "show this to everyone"; its parent says otherwise, and the parent
    // has to win. VEG-505 pinned exactly this fixture on the Prisma side.
    await ctx.prisma.subclass.create({
      data: {
        name: `Rite of Loam ${Date.now()}`,
        classId: brewClassId,
        contentSource: 'shared',
        createdById: ownerId,
        source: 'Shared',
        features: {
          create: [
            { name: GRANDPARENT_FEATURE_NAME, level: 3, description: 'Speak with the buried.' },
          ],
        },
      },
    });

    // The background branch, which shares this code path and is what unblocks
    // VEG-472. Nothing can author a homebrew BackgroundFeature over HTTP yet, so
    // this row is written directly — the read path is what is under test.
    await ctx.prisma.background.create({
      data: {
        name: `Guild Artisan ${Date.now()}`,
        contentSource: 'homebrew',
        createdById: ownerId,
        source: HOMEBREW_LABEL,
        features: {
          create: [{ name: BACKGROUND_FEATURE_NAME, description: 'A letter of passage.' }],
        },
      },
    });
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('the widened unique key', () => {
    // The whole reason the key moved. Three rows, one name, three levels — the
    // shape of Ability Score Improvement in every class in the game, and a
    // constraint violation before this migration.
    it('lets one feature name recur at different levels under the same class', async () => {
      const recurring = await ctx.prisma.classFeature.findMany({
        where: { classId: brewClassId, name: 'Ability Score Improvement' },
        orderBy: { level: 'asc' },
      });

      expect(recurring.map(f => f.level)).toEqual([4, 8]);

      const third = await ctx.prisma.classFeature.create({
        data: {
          classId: brewClassId,
          name: 'Ability Score Improvement',
          level: 12,
          description: '',
        },
      });
      expect(third.level).toBe(12);

      await ctx.prisma.classFeature.delete({ where: { id: third.id } });
    });

    it('still refuses the same name at the same level under one class', async () => {
      await expect(
        ctx.prisma.classFeature.create({
          data: {
            classId: brewClassId,
            name: 'Ability Score Improvement',
            level: 4,
            description: '',
          },
        })
      ).rejects.toThrow(/Unique constraint failed on the fields: \(`classId`,`name`,`level`\)/);
    });

    it('scopes the key to one class — two classes may each name a feature the same', async () => {
      const created = await ctx.prisma.classFeature.create({
        data: { classId: srdClassId, name: BREW_FEATURE_NAME, level: 1, description: '' },
      });

      expect(created.classId).toBe(srdClassId);
      await ctx.prisma.classFeature.delete({ where: { id: created.id } });
    });

    // Subclass features are not authorable until VEG-509; the key was widened in
    // the same migration because the two tables are the same shape. Proved here
    // so the migration is not carrying an untested half.
    it('applies the same widening to subclass features', async () => {
      const subclassId = (await ctx.prisma.subclass.findFirstOrThrow()).id;
      const rows = await ctx.prisma.$transaction([
        ctx.prisma.subclassFeature.create({
          data: { subclassId, name: 'Veg507 Recurring', level: 3, description: '' },
        }),
        ctx.prisma.subclassFeature.create({
          data: { subclassId, name: 'Veg507 Recurring', level: 9, description: '' },
        }),
      ]);
      expect(rows.map(r => r.level)).toEqual([3, 9]);

      await expect(
        ctx.prisma.subclassFeature.create({
          data: { subclassId, name: 'Veg507 Recurring', level: 3, description: '' },
        })
      ).rejects.toThrow(/Unique constraint failed on the fields: \(`subclassId`,`name`,`level`\)/);

      await ctx.prisma.subclassFeature.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    });
  });

  // The seed writes its feature rows with createMany(skipDuplicates), which
  // de-dupes against whichever unique index is in place. Widening the key could
  // have turned that skip into an insert and doubled every SRD feature on the
  // second run; nothing in the mocked suite would notice, because it never runs
  // the index.
  describe('re-seed after the migration', () => {
    it('does not duplicate SRD feature rows, and keeps their ids', async () => {
      const before = await ctx.prisma.classFeature.findMany({
        where: { class: { contentSource: 'srd' } },
        select: { id: true, classId: true, name: true, level: true },
        orderBy: [{ classId: 'asc' }, { level: 'asc' }, { name: 'asc' }],
      });
      expect(before.length).toBeGreaterThan(0);

      await ctx.seed.seed();

      const after = await ctx.prisma.classFeature.findMany({
        where: { class: { contentSource: 'srd' } },
        select: { id: true, classId: true, name: true, level: true },
        orderBy: [{ classId: 'asc' }, { level: 'asc' }, { name: 'asc' }],
      });

      expect(after).toEqual(before);
    });

    it('leaves the owner’s homebrew features untouched', async () => {
      const stillThere = await ctx.prisma.classFeature.findMany({
        where: { classId: brewClassId },
        select: { id: true },
      });

      expect(stillThere.map(f => f.id).sort()).toEqual([...brewFeatureIds].sort());
    });
  });

  // The leak this ticket exists to prevent, driven through the real service
  // against real rows rather than against a mock's recorded arguments.
  describe('a homebrew class’s features do not leak', () => {
    const namesOf = (page: { data: { name: string }[] }) => page.data.map(f => f.name);

    describe('searchFeatures (Prisma relation filter)', () => {
      it('shows them to their owner', async () => {
        const page = await srd.searchFeatures({ q: BREW_FEATURE_NAME }, ownerId);

        expect(namesOf(page)).toContain(BREW_FEATURE_NAME);
        expect(page.total).toBe(1);
      });

      it('hides them from another user, count included', async () => {
        const page = await srd.searchFeatures({ q: BREW_FEATURE_NAME }, strangerId);

        expect(namesOf(page)).toEqual([]);
        expect(page.total).toBe(0);
      });

      it('hides them from an anonymous caller', async () => {
        const page = await srd.searchFeatures({ q: BREW_FEATURE_NAME });

        expect(page.total).toBe(0);
      });

      // Naming the parent id directly is the obvious way to try to enumerate
      // someone else's class, so the filter has to survive it.
      it('does not open up when the stranger names the parent class id', async () => {
        const page = await srd.searchFeatures(
          { parentType: 'class', parentId: brewClassId },
          strangerId
        );

        expect(page.total).toBe(0);
      });

      it('still returns the SRD catalog to everyone', async () => {
        const anon = await srd.searchFeatures({ parentType: 'class' });
        const stranger = await srd.searchFeatures({ parentType: 'class' }, strangerId);

        expect(anon.total).toBeGreaterThan(0);
        expect(anon.total).toBe(stranger.total);
      });
    });

    describe('unified search (raw SQL EXISTS)', () => {
      const featureNames = (page: { data: { kind: string; data: unknown }[] }) =>
        page.data.map(hit => (hit.data as { name: string }).name);

      it('shows them to their owner', async () => {
        const page = await srd.search({ types: ['feature'], q: BREW_FEATURE_NAME }, ownerId);

        expect(featureNames(page)).toContain(BREW_FEATURE_NAME);
      });

      it('hides them from another user, count included', async () => {
        const page = await srd.search({ types: ['feature'], q: BREW_FEATURE_NAME }, strangerId);

        expect(page.data).toEqual([]);
        expect(page.total).toBe(0);
      });

      it('hides them from an anonymous caller', async () => {
        const page = await srd.search({ types: ['feature'], q: BREW_FEATURE_NAME });

        expect(page.total).toBe(0);
      });

      // The point of running both encodings over one fixture set: a relation
      // filter and an EXISTS subquery that disagree mean one of them leaks, and
      // each one's own unit spec would still pass.
      //
      // Every parent type, not just class. The unit spec asserts the raw SQL by
      // looking for the parent's table name in the generated string, which is
      // there whether or not the tier is actually checked — so deleting the
      // subclass grandparent predicate, or the background predicate, left all
      // 139 unit tests green. These four fixtures are what make those branches
      // falsifiable.
      it('agrees with searchFeatures about what each caller can see, for every parent', async () => {
        for (const parentType of ['class', 'subclass', 'background', 'race'] as const) {
          for (const caller of [ownerId, strangerId, undefined]) {
            const viaPrisma = await srd.searchFeatures({ parentType }, caller);
            const viaRawSql = await srd.search(
              { types: ['feature'], parentType, limit: 1 },
              caller
            );

            expect({ parentType, caller, total: viaRawSql.total }).toEqual({
              parentType,
              caller,
              total: viaPrisma.total,
            });
          }
        }
      });
    });

    // One case per remaining tiered branch, named so a failure says which rule
    // broke rather than just "a total disagreed".
    describe('the other tiered parents', () => {
      const totalFor = async (q: string, caller?: string) =>
        (await srd.searchFeatures({ q }, caller)).total;
      const rawTotalFor = async (q: string, caller?: string) =>
        (await srd.search({ types: ['feature'], q }, caller)).total;

      it('hides a homebrew subclass’s features from a stranger', async () => {
        expect(await totalFor(SUBCLASS_FEATURE_NAME, ownerId)).toBe(1);
        expect(await totalFor(SUBCLASS_FEATURE_NAME, strangerId)).toBe(0);
        expect(await rawTotalFor(SUBCLASS_FEATURE_NAME, ownerId)).toBe(1);
        expect(await rawTotalFor(SUBCLASS_FEATURE_NAME, strangerId)).toBe(0);
      });

      // The grandparent hop, and the only fixture that distinguishes it from a
      // one-hop check: the subclass is `shared`, so its OWN tier makes it
      // globally visible. Only its parent class hides it. Drop the second
      // aliasedVisibleSourceSql call from the subclass branch and this is the
      // assertion that fails.
      it('hides a globally-visible subclass’s features when its class is homebrew', async () => {
        expect(await totalFor(GRANDPARENT_FEATURE_NAME, ownerId)).toBe(1);
        expect(await totalFor(GRANDPARENT_FEATURE_NAME, strangerId)).toBe(0);
        expect(await rawTotalFor(GRANDPARENT_FEATURE_NAME, ownerId)).toBe(1);
        expect(await rawTotalFor(GRANDPARENT_FEATURE_NAME, strangerId)).toBe(0);
      });

      // Shares the code path with classes, and is what unblocks VEG-472.
      it('hides a homebrew background’s features from a stranger', async () => {
        expect(await totalFor(BACKGROUND_FEATURE_NAME, ownerId)).toBe(1);
        expect(await totalFor(BACKGROUND_FEATURE_NAME, strangerId)).toBe(0);
        expect(await rawTotalFor(BACKGROUND_FEATURE_NAME, ownerId)).toBe(1);
        expect(await rawTotalFor(BACKGROUND_FEATURE_NAME, strangerId)).toBe(0);
      });

      // Race is the one parent with no tier. Asserted so "unscoped" stays a
      // decision with a test behind it rather than a branch nobody exercises.
      it('shows race traits to everyone, since Race carries no tier', async () => {
        const anon = await srd.searchFeatures({ parentType: 'race' });
        const stranger = await srd.searchFeatures({ parentType: 'race' }, strangerId);

        expect(anon.total).toBeGreaterThan(0);
        expect(anon.total).toBe(stranger.total);
      });
    });

    describe('findFeaturesByIds (printable-card hydration)', () => {
      it('hydrates them for their owner', async () => {
        const rows = await srd.findFeaturesByIds(brewFeatureIds, ownerId);

        expect(rows.map(r => r.id).sort()).toEqual([...brewFeatureIds].sort());
      });

      // The ids are handed in by the client, so holding one must not be enough:
      // an id out of visibility has to resolve to nothing, indistinguishable
      // from an id that never existed.
      it('drops every one of them for another user holding the ids', async () => {
        const rows = await srd.findFeaturesByIds(brewFeatureIds, strangerId);

        expect(rows).toEqual([]);
      });

      it('drops them for an anonymous caller', async () => {
        expect(await srd.findFeaturesByIds(brewFeatureIds)).toEqual([]);
      });

      it('still hydrates SRD features for a stranger in the same batch', async () => {
        const srdFeatureId = (
          await ctx.prisma.classFeature.findFirstOrThrow({ where: { classId: srdClassId } })
        ).id;

        const rows = await srd.findFeaturesByIds([...brewFeatureIds, srdFeatureId], strangerId);

        expect(rows.map(r => r.id)).toEqual([srdFeatureId]);
      });
    });
  });

  // The atomicity of the feature replacement, which nothing else can reach.
  //
  // performUpdate does `srdClass.update`, then `classFeature.deleteMany`, then
  // `createMany`, all on the transaction client. Swapping `tx` for `this.prisma`
  // inside the callback moves every write onto the pool connection and destroys
  // the rollback property — and the unit spec cannot see it, because the Prisma
  // mock's $transaction hands the callback the same mock object, so `tx.x` and
  // `this.prisma.x` are one jest.fn. Only a real transaction distinguishes them.
  describe('a failed feature replacement rolls the whole update back', () => {
    it('leaves the class description AND its original features untouched', async () => {
      const owner = { userId: ownerId, isAdmin: false };
      const cls = await ctx.prisma.srdClass.create({
        data: {
          name: `Rollback Warden ${Date.now()}`,
          hitDie: 'd8',
          description: 'before',
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_LABEL,
          features: {
            create: [
              { name: 'Keep Me', level: 1, description: 'original' },
              { name: 'Keep Me Too', level: 2, description: 'original' },
            ],
          },
        },
      });

      // Called on the service directly, bypassing the DTO: @ArrayUnique is what
      // normally refuses a repeated (name, level), so this is the one way to
      // drive createMany into the real index and make the third write fail after
      // the first two have already run.
      await expect(
        homebrewClasses.update(
          cls.id,
          {
            description: 'after',
            features: [
              { name: 'Ability Score Improvement', level: 4 },
              { name: 'Ability Score Improvement', level: 4 },
            ],
          } as never,
          owner
        )
      ).rejects.toThrow(/feature/i);

      const after = await ctx.prisma.srdClass.findUniqueOrThrow({
        where: { id: cls.id },
        include: { features: { orderBy: { level: 'asc' } } },
      });

      // The parent update came first and the delete second; if either escaped
      // the transaction, one of these two assertions fails.
      expect(after.description).toBe('before');
      expect(after.features.map(f => f.name)).toEqual(['Keep Me', 'Keep Me Too']);
    });

    // The same path on its happy branch, so the rollback case above cannot pass
    // by the update silently doing nothing at all.
    it('commits both halves when the insert succeeds', async () => {
      const owner = { userId: ownerId, isAdmin: false };
      const cls = await ctx.prisma.srdClass.create({
        data: {
          name: `Commit Warden ${Date.now()}`,
          hitDie: 'd8',
          description: 'before',
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_LABEL,
          features: { create: [{ name: 'Replace Me', level: 1, description: 'original' }] },
        },
      });

      await homebrewClasses.update(
        cls.id,
        {
          description: 'after',
          features: [
            { name: 'Ability Score Improvement', level: 4 },
            { name: 'Ability Score Improvement', level: 8 },
          ],
        } as never,
        owner
      );

      const after = await ctx.prisma.srdClass.findUniqueOrThrow({
        where: { id: cls.id },
        include: { features: { orderBy: { level: 'asc' } } },
      });

      expect(after.description).toBe('after');
      expect(after.features.map(f => [f.level, f.name])).toEqual([
        [4, 'Ability Score Improvement'],
        [8, 'Ability Score Improvement'],
      ]);
    });
  });
});
