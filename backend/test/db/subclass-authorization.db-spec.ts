// Real-DB regression test for homebrew subclass authorization (VEG-509). Runs
// via `npm run test:db` against the disposable test DB.
//
// The rule under test is the one VEG-509 adds: a subclass's parent class must be
// visible to its author. Nothing in the schema enforces it, and no constraint
// could, since "visible" depends on who is asking. The service check is the
// entire guard, and the mocked unit suite can only assert
// that a `findFirst` was issued with a particular where clause. Here the rows are
// real: a stranger's homebrew class is inserted, the service is asked to hang a
// subclass off it, and the refusal is compared byte for byte with the refusal for
// an id that never existed.
//
// The second half is the user-delete ordering. `UsersService.remove` clears
// subclasses before classes because `Subclass.classId` is ON DELETE RESTRICT, and
// that ordering is only sufficient while every subclass's parent is either its
// own author's class or a global-tier one. The cross-owner fixture (A's shared
// class, B's subclass under it) is the case that would break it, replayed through
// the same transaction the service runs.
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import type { Cache } from 'cache-manager';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SrdService } from '../../src/srd/srd.service';
import { HomebrewClassesService } from '../../src/srd/homebrew-classes.service';
import { HomebrewSubclassesService } from '../../src/srd/homebrew-subclasses.service';
import { ContentAccessService } from '../../src/srd/content-access.service';

const HOMEBREW_LABEL = 'Homebrew';
const SHARED_LABEL = 'Shared';
const RUN = Date.now();

// SrdService only touches the cache from invalidateCache, which nothing here
// calls, but the constructor demands one.
const noopCache = { clear: () => Promise.resolve() } as unknown as Cache;

describe('homebrew subclass authorization, real DB (VEG-509)', () => {
  let ctx: SeedContext;
  let srd: SrdService;
  let service: HomebrewSubclassesService;
  let homebrewClasses: HomebrewClassesService;

  let ownerId: string;
  let strangerId: string;
  let owner: { userId: string; isAdmin: boolean };
  let stranger: { userId: string; isAdmin: boolean };

  let srdClassId: string;
  let ownClassId: string;
  let sharedClassId: string;
  let strangerClassId: string;

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);
    await ctx.seed.seed();

    const access = new ContentAccessService();
    srd = new SrdService(ctx.prisma, access, noopCache);
    service = new HomebrewSubclassesService(ctx.prisma, access);
    homebrewClasses = new HomebrewClassesService(ctx.prisma, access);

    const [a, b] = await Promise.all([
      ctx.prisma.user.create({
        data: { username: `veg509-owner-${RUN}`, passwordHash: 'x', displayName: 'Owner' },
      }),
      ctx.prisma.user.create({
        data: { username: `veg509-other-${RUN}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    ownerId = a.id;
    strangerId = b.id;
    owner = { userId: ownerId, isAdmin: false };
    stranger = { userId: strangerId, isAdmin: false };

    srdClassId = (await ctx.prisma.srdClass.findFirstOrThrow({ where: { contentSource: 'srd' } }))
      .id;

    const [own, shared, foreign] = await Promise.all([
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Own Warden ${RUN}`,
          hitDie: 'd10',
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_LABEL,
        },
      }),
      // Inserted directly: the shared tier is admin-published and this spec has
      // no admin actor, but the tier is what the visibility rule reads.
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Shared Cantor ${RUN}`,
          hitDie: 'd8',
          contentSource: 'shared',
          createdById: ownerId,
          source: SHARED_LABEL,
        },
      }),
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Foreign Reaver ${RUN}`,
          hitDie: 'd12',
          contentSource: 'homebrew',
          createdById: strangerId,
          source: HOMEBREW_LABEL,
        },
      }),
    ]);
    ownClassId = own.id;
    sharedClassId = shared.id;
    strangerClassId = foreign.id;
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('which classes an author may hang a subclass off', () => {
    it('accepts an SRD class, stamping the homebrew tier and the author', async () => {
      const created = await service.create(
        { name: `Veg509 Path of Ash ${RUN}`, classId: srdClassId } as never,
        owner
      );

      expect(created).toMatchObject({
        classId: srdClassId,
        contentSource: 'homebrew',
        createdById: ownerId,
      });
    });

    it('accepts the author’s own homebrew class', async () => {
      const created = await service.create(
        { name: `Veg509 Path of Loam ${RUN}`, classId: ownClassId } as never,
        owner
      );

      expect(created.classId).toBe(ownClassId);
    });

    it('accepts a shared class, which is globally visible like SRD', async () => {
      const created = await service.create(
        { name: `Veg509 Path of Bells ${RUN}`, classId: sharedClassId } as never,
        owner
      );

      expect(created.classId).toBe(sharedClassId);
    });

    // The confidentiality property, and the reason the check is a scoped
    // findFirst rather than a findUnique plus a tier test: the stranger's class
    // and a class that never existed have to be the same answer, or the endpoint
    // is an oracle for whether a given id belongs to somebody.
    it('refuses another user’s homebrew class exactly as it refuses a nonexistent one', async () => {
      const foreign = await service
        .create({ name: `Veg509 Stolen ${RUN}`, classId: strangerClassId } as never, owner)
        .catch((err: BadRequestException) => err);
      const missing = await service
        .create(
          {
            name: `Veg509 Missing ${RUN}`,
            classId: '00000000-0000-4000-8000-000000000000',
          } as never,
          owner
        )
        .catch((err: BadRequestException) => err);

      expect(foreign).toBeInstanceOf(BadRequestException);
      expect(missing).toBeInstanceOf(BadRequestException);
      expect((foreign as BadRequestException).getStatus()).toBe(
        (missing as BadRequestException).getStatus()
      );
      expect((foreign as BadRequestException).message).toBe(
        (missing as BadRequestException).message
      );
    });

    // Proves the check is load-bearing rather than redundant: the database
    // itself is perfectly happy to store the row the service refuses, so
    // deleting the guard would silently make the refusal above pass.
    it('has no database constraint behind it, so the service check is the only guard', async () => {
      const row = await ctx.prisma.subclass.create({
        data: {
          name: `Veg509 Unguarded ${RUN}`,
          classId: strangerClassId,
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_LABEL,
        },
      });

      try {
        expect(row.classId).toBe(strangerClassId);
      } finally {
        await ctx.prisma.subclass.delete({ where: { id: row.id } });
      }
    });
  });

  describe('a stranger cannot read or write the row', () => {
    let subclassId: string;

    beforeAll(async () => {
      const created = await service.create(
        {
          name: `Veg509 Private Path ${RUN}`,
          classId: srdClassId,
          features: [{ name: 'Ashen Step', level: 3, description: 'Step through cinders.' }],
        } as never,
        owner
      );
      subclassId = created.id;
    });

    it('reads as nothing for the stranger and as itself for the owner', async () => {
      expect(await srd.findSubclass(subclassId, strangerId)).toBeNull();
      expect(await srd.findSubclass(subclassId, ownerId)).toMatchObject({ id: subclassId });
    });

    it('refuses the stranger’s update and delete as not found, never as forbidden', async () => {
      await expect(
        service.update(subclassId, { description: 'x' } as never, stranger)
      ).rejects.toThrow(NotFoundException);
      await expect(service.remove(subclassId, stranger)).rejects.toThrow(NotFoundException);
    });

    // SubclassFeature is ON DELETE CASCADE, which is why the service overrides
    // no performDelete. If that FK rule ever changed, the orphan rows would
    // outlive their parent with nothing else to notice.
    it('takes the feature rows with it when the owner deletes it', async () => {
      await service.remove(subclassId, owner);

      expect(await ctx.prisma.subclassFeature.count({ where: { subclassId } })).toBe(0);
      expect(await ctx.prisma.subclass.count({ where: { id: subclassId } })).toBe(0);
    });
  });

  // The other half of the parent relationship: RESTRICT means the class cannot
  // go while a subclass points at it, which HomebrewClassesService answers as a
  // 409 rather than an opaque 500.
  describe('deleting the parent class', () => {
    it('is refused while a subclass hangs off it, and allowed once it is gone', async () => {
      const cls = await ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Doomed ${RUN}`,
          hitDie: 'd6',
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_LABEL,
        },
      });
      const sub = await service.create(
        { name: `Veg509 Doomed Path ${RUN}`, classId: cls.id } as never,
        owner
      );

      await expect(homebrewClasses.remove(cls.id, owner)).rejects.toThrow(ConflictException);

      await service.remove(sub.id, owner);
      await expect(homebrewClasses.remove(cls.id, owner)).resolves.toBeUndefined();
    });
  });

  /**
   * The cross-owner case the user-delete ordering has to survive: A's shared
   * class with B's homebrew subclass under it. Deleting A must not touch B's
   * row, and deleting B must not be blocked by A's class.
   */
  describe('deleting a user whose class another user has subclassed', () => {
    const removeUser = (prisma: SeedContext['prisma'], id: string) =>
      prisma.$transaction(async tx => {
        const homebrewByUser = { where: { createdById: id, contentSource: 'homebrew' as const } };
        await tx.subclass.deleteMany(homebrewByUser);
        await tx.srdClass.deleteMany(homebrewByUser);
        await tx.user.delete({ where: { id } });
      });

    it('keeps the shared class and the other user’s subclass, then clears them with their author', async () => {
      const [authorA, authorB] = await Promise.all([
        ctx.prisma.user.create({
          data: { username: `veg509-a-${RUN}`, passwordHash: 'x', displayName: 'A' },
        }),
        ctx.prisma.user.create({
          data: { username: `veg509-b-${RUN}`, passwordHash: 'x', displayName: 'B' },
        }),
      ]);
      const sharedClass = await ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Shared By A ${RUN}`,
          hitDie: 'd10',
          contentSource: 'shared',
          createdById: authorA.id,
          source: SHARED_LABEL,
        },
      });
      const sub = await service.create(
        { name: `Veg509 B Path ${RUN}`, classId: sharedClass.id } as never,
        { userId: authorB.id, isAdmin: false }
      );

      await removeUser(ctx.prisma, authorA.id);

      // The shared class survives its author via the SET NULL FK, so B's
      // subclass still has a parent to point at.
      const survivor = await ctx.prisma.srdClass.findUniqueOrThrow({
        where: { id: sharedClass.id },
      });
      expect(survivor.createdById).toBeNull();
      expect(await ctx.prisma.subclass.count({ where: { id: sub.id } })).toBe(1);

      await removeUser(ctx.prisma, authorB.id);

      expect(await ctx.prisma.subclass.count({ where: { id: sub.id } })).toBe(0);
    });
  });
});
