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
import type { ContentSource } from '@grimoire-os/shared';

const HOMEBREW_LABEL = 'Homebrew';

// The same fragment ContentAccessService.visibleTo builds. Declared with a
// mutable ContentSource[] because Prisma's `in` will not take a readonly array.
const GLOBAL_SOURCES: ContentSource[] = ['srd', 'shared'];
const visibleTo = (userId?: string) =>
  userId
    ? { OR: [{ contentSource: { in: GLOBAL_SOURCES } }, { createdById: userId }] }
    : { contentSource: { in: GLOBAL_SOURCES } };

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

  // The srd partial index on subclasses had no coverage: the migration comment
  // says "the seed relies on that guarantee", but seedSubclasses resolves by
  // findFirst and never touches the index, so a mis-authored predicate would be
  // invisible.
  describe('the srd subclass index', () => {
    it('keeps SRD subclass names globally unique', async () => {
      const existing = await ctx.prisma.subclass.findUniqueOrThrow({
        where: { id: srdSubclassId },
      });

      await expect(
        ctx.prisma.subclass.create({
          data: { name: existing.name, classId: srdClassId, contentSource: 'srd' },
        })
      ).rejects.toThrow(/Unique constraint failed on the fields: \(`name`\)/);
    });
  });

  // The parent check in `visibleSubclassWhere` is a Prisma relation filter; no
  // unit-level shape assertion can prove it actually excludes anything. This is
  // the one fixture where it changes the answer today: a subclass the caller
  // could otherwise see, hanging off a parent they cannot.
  describe('subclass visibility follows its parent class', () => {
    let hiddenParentId: string;
    let sharedSubclassId: string;

    beforeAll(async () => {
      const { prisma } = ctx;
      const parent = await prisma.srdClass.create({
        data: {
          name: `Hidden Parent ${Date.now()}`,
          hitDie: 'd8',
          contentSource: 'homebrew',
          createdById: otherUserId,
          source: HOMEBREW_LABEL,
        },
      });
      hiddenParentId = parent.id;
      // `shared` is globally visible on its own, so only the parent check can
      // exclude it.
      const sub = await prisma.subclass.create({
        data: { name: `Shared Sub ${Date.now()}`, classId: parent.id, contentSource: 'shared' },
      });
      sharedSubclassId = sub.id;
    });

    it('is visible when only the subclass row is scoped', async () => {
      const rows = await ctx.prisma.subclass.findMany({
        where: { id: sharedSubclassId, ...visibleTo(userId) },
      });
      expect(rows).toHaveLength(1);
    });

    it('is hidden once the parent class must be visible too', async () => {
      const rows = await ctx.prisma.subclass.findMany({
        where: {
          id: sharedSubclassId,
          ...visibleTo(userId),
          srdClass: { is: visibleTo(userId) },
        },
      });
      expect(rows).toHaveLength(0);
    });

    it('is visible to the parent’s owner', async () => {
      const rows = await ctx.prisma.subclass.findMany({
        where: {
          id: sharedSubclassId,
          ...visibleTo(otherUserId),
          srdClass: { is: visibleTo(otherUserId) },
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].classId).toBe(hiddenParentId);
    });
  });

  // loadClassData resolves a free-text class name against the owner's visible
  // set. Scoping narrows the tie but does not break it: the owner's homebrew
  // "Fighter" and the SRD "Fighter" both match, and an unordered findFirst lets
  // Postgres return either, so spell slots would flip between reads.
  describe('the loadClassData tie-break', () => {
    it('returns the owner’s homebrew class ahead of the identically-named SRD row', async () => {
      const where = {
        name: srdClassName,
        OR: [{ contentSource: { in: GLOBAL_SOURCES } }, { createdById: userId }],
      };
      const both = await ctx.prisma.srdClass.findMany({ where, select: { id: true } });
      expect(both.length).toBeGreaterThan(1);

      const picked = await ctx.prisma.srdClass.findFirst({
        where,
        orderBy: [{ createdById: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        select: { id: true, contentSource: true, createdById: true },
      });
      expect(picked?.contentSource).toBe('homebrew');
      expect(picked?.createdById).toBe(userId);
    });

    it('falls back to the SRD row when the owner has no homebrew of that name', async () => {
      const picked = await ctx.prisma.srdClass.findFirst({
        where: {
          name: srdClassName,
          OR: [{ contentSource: { in: GLOBAL_SOURCES } }, { createdById: 'user-with-no-homebrew' }],
        },
        orderBy: [{ createdById: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        select: { contentSource: true },
      });
      expect(picked?.contentSource).toBe('srd');
    });
  });

  // The CHECK was added for the delete path, not the insert path: the migration
  // justifies it as "a SET NULL firing on homebrew would violate these CHECKs
  // and abort the delete". users.service.spec.ts is fully mocked, so it can
  // prove the deleteMany ordering but not that the constraints back it.
  describe('deleting a user who owns homebrew classes', () => {
    async function makeOwnerWithHomebrew(tag: string) {
      const { prisma } = ctx;
      const user = await prisma.user.create({
        data: { username: `veg505-${tag}-${Date.now()}`, passwordHash: 'x', displayName: tag },
      });
      const cls = await prisma.srdClass.create({
        data: {
          name: `${tag} Class ${Date.now()}`,
          hitDie: 'd8',
          contentSource: 'homebrew',
          createdById: user.id,
          source: HOMEBREW_LABEL,
        },
      });
      await prisma.subclass.create({
        data: {
          name: `${tag} Sub ${Date.now()}`,
          classId: cls.id,
          contentSource: 'homebrew',
          createdById: user.id,
        },
      });
      return { userId: user.id, classId: cls.id };
    }

    it('aborts the delete rather than nulling the creator of a homebrew row', async () => {
      const { userId: id } = await makeOwnerWithHomebrew('abort');

      await expect(ctx.prisma.user.delete({ where: { id } })).rejects.toThrow(
        /srd_classes_homebrew_has_creator_check/
      );
      // Still there: the transaction rolled back rather than half-deleting.
      await expect(ctx.prisma.user.findUniqueOrThrow({ where: { id } })).resolves.toBeDefined();
    });

    it('refuses to remove a class while its subclasses still reference it', async () => {
      const { classId } = await makeOwnerWithHomebrew('restrict');

      // Subclass.classId is ON DELETE RESTRICT, which is what makes the
      // subclass-before-class ordering in UsersService.remove load-bearing.
      await expect(ctx.prisma.srdClass.delete({ where: { id: classId } })).rejects.toThrow(
        /Foreign key constraint violated/
      );
    });

    it('succeeds when subclasses are cleared before classes, as the service does', async () => {
      const { userId: id } = await makeOwnerWithHomebrew('ordered');
      const homebrewByUser = { where: { createdById: id, contentSource: 'homebrew' as const } };

      await ctx.prisma.$transaction(async tx => {
        await tx.subclass.deleteMany(homebrewByUser);
        await tx.srdClass.deleteMany(homebrewByUser);
        await tx.user.delete({ where: { id } });
      });

      expect(await ctx.prisma.user.findUnique({ where: { id } })).toBeNull();
      expect(await ctx.prisma.srdClass.count({ where: { createdById: id } })).toBe(0);
    });
  });
});
