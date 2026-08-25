// Real-DB regression test for tiering SrdClass and Subclass (VEG-505).
//
// seed.service.spec.ts mocks Prisma, so it can prove the seed *asks* for the srd
// partition but not that the partial unique indexes, the CHECK constraint, or a
// re-seed alongside a homebrew row actually behave. Those are database objects
// Prisma cannot model in schema.prisma (they are hand-authored in the migration),
// so this is the only place they are exercised.
//
// The load-bearing scenario: a user owns a homebrew class that reuses an SRD
// class name. Before VEG-505 that could not exist, and the seed's
// upsert-by-name would have clobbered it the moment it could.
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

const HOMEBREW_LABEL = 'Homebrew';

describe('class content-source tiering — real DB (VEG-505)', () => {
  let ctx: SeedContext;
  let userId: string;
  let otherUserId: string;

  // Captured after the first seed.
  let srdClassId: string;
  let srdClassName: string;
  let srdClassHitDie: string;
  let srdSubclassId: string;
  let srdClassFeatureIds: string[];
  let srdClassCount: number;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma, seed } = ctx;

    await truncateAll(prisma);
    await seed.seed();

    // Discover a real class that has both a subclass and features rather than
    // hardcoding "Fighter", so a data edit does not silently skip the assertions.
    const subclass = await prisma.subclass.findFirstOrThrow();
    srdSubclassId = subclass.id;
    const cls = await prisma.srdClass.findUniqueOrThrow({ where: { id: subclass.classId } });
    srdClassId = cls.id;
    srdClassName = cls.name;
    srdClassHitDie = cls.hitDie;
    srdClassFeatureIds = (
      await prisma.classFeature.findMany({ where: { classId: cls.id }, select: { id: true } })
    ).map(f => f.id);
    srdClassCount = await prisma.srdClass.count();

    const [user, other] = await Promise.all([
      prisma.user.create({
        data: { username: `veg505-${Date.now()}`, passwordHash: 'x', displayName: 'Owner' },
      }),
      prisma.user.create({
        data: { username: `veg505-other-${Date.now()}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    userId = user.id;
    otherUserId = other.id;
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('partial unique indexes', () => {
    it('lets a homebrew class reuse an SRD class name', async () => {
      const created = await ctx.prisma.srdClass.create({
        data: {
          name: srdClassName,
          hitDie: 'd6',
          contentSource: 'homebrew',
          createdById: userId,
          source: HOMEBREW_LABEL,
        },
      });

      expect(created.id).not.toBe(srdClassId);
      const bothNames = await ctx.prisma.srdClass.findMany({ where: { name: srdClassName } });
      expect(bothNames).toHaveLength(2);
    });

    it('lets a different user reuse that same name again', async () => {
      const created = await ctx.prisma.srdClass.create({
        data: {
          name: srdClassName,
          hitDie: 'd8',
          contentSource: 'homebrew',
          createdById: otherUserId,
          source: HOMEBREW_LABEL,
        },
      });

      expect(created.createdById).toBe(otherUserId);
    });

    it('stops ONE user owning two homebrew classes with the same name', async () => {
      await expect(
        ctx.prisma.srdClass.create({
          data: {
            name: srdClassName,
            hitDie: 'd10',
            contentSource: 'homebrew',
            createdById: userId,
            source: HOMEBREW_LABEL,
          },
        })
      ).rejects.toThrow(/Unique constraint failed on the fields: \(`name`,`createdById`\)/);
    });

    it('still keeps SRD class names globally unique', async () => {
      await expect(
        ctx.prisma.srdClass.create({
          data: { name: srdClassName, hitDie: 'd12', contentSource: 'srd' },
        })
      ).rejects.toThrow(/Unique constraint failed on the fields: \(`name`\)/);
    });

    it('scopes the homebrew subclass index by parent class as well as owner', async () => {
      const { prisma } = ctx;
      const [a, b] = await Promise.all([
        prisma.srdClass.create({
          data: {
            name: `Parent A ${Date.now()}`,
            hitDie: 'd8',
            contentSource: 'homebrew',
            createdById: userId,
            source: HOMEBREW_LABEL,
          },
        }),
        prisma.srdClass.create({
          data: {
            name: `Parent B ${Date.now()}`,
            hitDie: 'd8',
            contentSource: 'homebrew',
            createdById: userId,
            source: HOMEBREW_LABEL,
          },
        }),
      ]);

      // The same subclass name under two different parents is legitimate.
      const shared = {
        name: 'Path of Ash',
        contentSource: 'homebrew' as const,
        createdById: userId,
      };
      await prisma.subclass.create({ data: { ...shared, classId: a.id } });
      await expect(
        prisma.subclass.create({ data: { ...shared, classId: b.id } })
      ).resolves.toBeDefined();

      // Twice under the SAME parent is not.
      await expect(prisma.subclass.create({ data: { ...shared, classId: a.id } })).rejects.toThrow(
        /Unique constraint failed on the fields: \(`name`,`createdById`,`classId`\)/
      );
    });
  });

  describe('homebrew-has-creator CHECK', () => {
    it('refuses a homebrew class with no creator', async () => {
      await expect(
        ctx.prisma.srdClass.create({
          data: { name: `Orphan ${Date.now()}`, hitDie: 'd8', contentSource: 'homebrew' },
        })
      ).rejects.toThrow(/srd_classes_homebrew_has_creator_check/);
    });

    it('refuses a homebrew subclass with no creator', async () => {
      await expect(
        ctx.prisma.subclass.create({
          data: { name: `Orphan ${Date.now()}`, classId: srdClassId, contentSource: 'homebrew' },
        })
      ).rejects.toThrow(/subclasses_homebrew_has_creator_check/);
    });

    it('allows a shared row with no creator, since SET NULL must not break it', async () => {
      await expect(
        ctx.prisma.srdClass.create({
          data: { name: `Shared ${Date.now()}`, hitDie: 'd8', contentSource: 'shared' },
        })
      ).resolves.toBeDefined();
    });
  });

  // The property the whole slice exists to protect: a re-seed must not read,
  // update, or delete a homebrew class that happens to share an SRD name.
  describe('re-seed with a name-colliding homebrew class present', () => {
    let homebrewId: string;

    beforeAll(async () => {
      const { prisma, seed } = ctx;
      const homebrew = await prisma.srdClass.findFirstOrThrow({
        where: { name: srdClassName, contentSource: 'homebrew', createdById: userId },
      });
      homebrewId = homebrew.id;

      // Mutate the SRD row so the re-seed has a correction to propagate, which
      // is the VEG-480 property this must not regress.
      await prisma.srdClass.update({ where: { id: srdClassId }, data: { hitDie: 'd2' } });

      await seed.seed();
    }, 120_000);

    it('leaves the homebrew row untouched', async () => {
      const after = await ctx.prisma.srdClass.findUniqueOrThrow({ where: { id: homebrewId } });
      expect(after.contentSource).toBe('homebrew');
      expect(after.createdById).toBe(userId);
      expect(after.hitDie).toBe('d6');
      expect(after.source).toBe(HOMEBREW_LABEL);
    });

    it('still propagates the edit to the SRD row', async () => {
      const after = await ctx.prisma.srdClass.findUniqueOrThrow({ where: { id: srdClassId } });
      expect(after.hitDie).toBe(srdClassHitDie);
    });

    it('keeps the SRD class id stable so child FKs survive', async () => {
      const { prisma } = ctx;
      const after = await prisma.srdClass.findUniqueOrThrow({ where: { id: srdClassId } });
      expect(after.name).toBe(srdClassName);

      const featureIds = (
        await prisma.classFeature.findMany({
          where: { classId: srdClassId },
          select: { id: true },
        })
      ).map(f => f.id);
      expect(featureIds.sort()).toEqual(srdClassFeatureIds.sort());

      const subclass = await prisma.subclass.findUniqueOrThrow({ where: { id: srdSubclassId } });
      expect(subclass.classId).toBe(srdClassId);
    });

    it('inserts no duplicate SRD classes', async () => {
      const srdCount = await ctx.prisma.srdClass.count({ where: { contentSource: 'srd' } });
      expect(srdCount).toBe(srdClassCount);
    });

    it('tags every seeded class and subclass as srd', async () => {
      const { prisma } = ctx;
      const seededClasses = await prisma.srdClass.count({
        where: { contentSource: 'srd', createdById: null },
      });
      expect(seededClasses).toBe(srdClassCount);
      const nonSrdSeeded = await prisma.subclass.count({
        where: { id: srdSubclassId, contentSource: 'srd' },
      });
      expect(nonSrdSeeded).toBe(1);
    });
  });
});
