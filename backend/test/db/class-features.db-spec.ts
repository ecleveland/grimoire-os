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

  let ownerId: string;
  let strangerId: string;
  let srdClassId: string;

  // The owner's homebrew class and the features hanging off it. This is the row
  // set every leak assertion below is about.
  let brewClassId: string;
  let brewFeatureIds: string[];
  const BREW_FEATURE_NAME = 'Veg507 Wardens Bond';

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

      // The point of running both encodings over one fixture: a relation filter
      // and an EXISTS subquery that disagree mean one of them leaks, and each
      // one's own unit spec would still pass.
      it('agrees with searchFeatures about what each caller can see', async () => {
        for (const caller of [ownerId, strangerId, undefined]) {
          const viaPrisma = await srd.searchFeatures({ parentType: 'class' }, caller);
          const viaRawSql = await srd.search(
            { types: ['feature'], parentType: 'class', limit: 1 },
            caller
          );

          expect(viaRawSql.total).toBe(viaPrisma.total);
        }
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
});
