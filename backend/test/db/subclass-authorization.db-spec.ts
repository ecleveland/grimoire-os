// Real-DB regression test for homebrew subclass writes (VEG-509). Runs via
// `npm run test:db` against the disposable test DB.
//
// What it drives, against real rows:
//
// 1. The parent-visibility rule, through HomebrewSubclassesService. An author may
//    hang a subclass off an SRD class, a shared class, or their own homebrew
//    class. Another user's homebrew class is refused with the same status and
//    message as an id that never existed. A direct insert under that same class
//    succeeds, which pins that no database constraint backs the service check.
// 2. The row's own visibility. A stranger reads nothing and gets 404 on update
//    and delete, and the owner's delete takes the feature rows with it.
// 3. The RESTRICT FK from the other side. HomebrewClassesService refuses to delete
//    a class while a subclass hangs off it, and allows it once the subclass is gone.
// 4. The real `UsersService.remove` across two authors. A owns a homebrew class
//    with a homebrew subclass under it, which fails if the service deletes classes
//    before subclasses, and a shared class that B has subclassed, which must
//    survive A with a nulled creator and then go with B. Alongside it, the error
//    class a homebrew CHECK violation really carries, which is what the delete's
//    retry predicate keys on.
// 5. Two overlapping features-only updates on one subclass, interleaved on
//    purpose, which must end with one list or the other and never both.
import { createSeedContext, teardownSeedContext, type SeedContext } from './db-harness';
import type { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SrdService } from '../../src/srd/srd.service';
import { HomebrewClassesService } from '../../src/srd/homebrew-classes.service';
import { HomebrewSubclassesService } from '../../src/srd/homebrew-subclasses.service';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { UsersService, isConcurrentWriteConflict } from '../../src/users/users.service';
import { HOMEBREW_SOURCE_LABEL, SHARED_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';
import type { RefreshTokenService } from '../../src/auth/refresh-token.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

const RUN = Date.now();

// SrdService only touches the cache from invalidateCache, which nothing here
// calls, but the constructor demands one.
const noopCache = { clear: () => Promise.resolve() } as unknown as Cache;

// `UsersService.remove` never touches refresh tokens; the constructor demands the
// dependency for the password and role paths, which nothing here calls.
const unusedRefreshTokens = {} as RefreshTokenService;

/**
 * The real client, except that inside a transaction the subclass feature insert
 * calls `pause` after it runs and before the transaction can commit. That is the
 * point where the first of two overlapping replacements holds its row locks and
 * has written rows nobody else can see yet, which is the state the race needs.
 * Everything else, the parent lookup and the row lock included, goes straight to
 * the real client.
 */
function pauseAfterFeatureInsert(real: PrismaService, pause: () => Promise<void>): PrismaService {
  const forward = <T extends object>(target: T, prop: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, prop);
    return typeof value === 'function'
      ? (value as (...a: unknown[]) => unknown).bind(target)
      : value;
  };

  return new Proxy(real, {
    get(target, prop) {
      if (prop !== '$transaction') return forward(target, prop);
      return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        target.$transaction(tx =>
          fn(
            new Proxy(tx, {
              get(txTarget, txProp) {
                if (txProp !== 'subclassFeature') return forward(txTarget, txProp);
                const features = txTarget.subclassFeature;
                return {
                  deleteMany: (args: Prisma.SubclassFeatureDeleteManyArgs) =>
                    features.deleteMany(args),
                  createMany: async (args: Prisma.SubclassFeatureCreateManyArgs) => {
                    const written = await features.createMany(args);
                    await pause();
                    return written;
                  },
                };
              },
            })
          )
        );
    },
  });
}

/**
 * Wait until some session on the test database is blocked on a lock. Polling
 * `pg_stat_activity` makes the interleave deterministic, because the second
 * update is released only once Postgres itself reports it waiting, rather than after a
 * sleep that is either too short on a slow machine or wasted on a fast one.
 */
async function waitForBlockedSession(prisma: PrismaService): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (blocked > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('The second update never blocked behind the first');
}

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
    // No truncate and no seed. Every row this file reads it inserts, under a
    // RUN-stamped name, and nothing here counts rows it did not write.
    ctx = await createSeedContext();

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

    const [srdClass, own, shared, foreign] = await Promise.all([
      // Stands in for a seeded class: SRD tier, no owner, which is all the
      // visibility rule reads.
      ctx.prisma.srdClass.create({
        data: { name: `Veg509 Srd Fighter ${RUN}`, hitDie: 'd10', contentSource: 'srd' },
      }),
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Own Warden ${RUN}`,
          hitDie: 'd10',
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_SOURCE_LABEL,
        },
      }),
      // Inserted directly, because the shared tier is admin-published and this
      // spec has no admin actor, while the tier is what the visibility rule reads.
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Shared Cantor ${RUN}`,
          hitDie: 'd8',
          contentSource: 'shared',
          createdById: ownerId,
          source: SHARED_SOURCE_LABEL,
        },
      }),
      ctx.prisma.srdClass.create({
        data: {
          name: `Veg509 Foreign Reaver ${RUN}`,
          hitDie: 'd12',
          contentSource: 'homebrew',
          createdById: strangerId,
          source: HOMEBREW_SOURCE_LABEL,
        },
      }),
    ]);
    srdClassId = srdClass.id;
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

    it("accepts the author's own homebrew class", async () => {
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
    // findFirst rather than a findUnique plus a tier test. The stranger's class
    // and a class that never existed have to be the same answer, or the endpoint
    // is an oracle for whether a given id belongs to somebody.
    it("refuses another user's homebrew class exactly as it refuses a nonexistent one", async () => {
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

    // Deleting the service guard makes the refusal test above fail loudly. What
    // this one pins is the other half. The database alone accepts the row the
    // service refuses, so the service check is the only line of defense, and
    // no one should remove it on the belief that a constraint backs it up.
    it('has no database constraint behind it, so the service check is the only guard', async () => {
      const row = await ctx.prisma.subclass.create({
        data: {
          name: `Veg509 Unguarded ${RUN}`,
          classId: strangerClassId,
          contentSource: 'homebrew',
          createdById: ownerId,
          source: HOMEBREW_SOURCE_LABEL,
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

    it("refuses the stranger's update and delete as not found, never as forbidden", async () => {
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
          source: HOMEBREW_SOURCE_LABEL,
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
   * Two things `UsersService.remove` has to get right about subclasses. A's own
   * homebrew subclass under A's own homebrew class only deletes if subclasses go
   * before classes, since the FK is RESTRICT. B's subclass under A's shared class
   * must not go with A at all, because the shared class survives its author.
   */
  describe('deleting a user who owns classes with subclasses under them', () => {
    let users: UsersService;

    beforeAll(() => {
      users = new UsersService(ctx.prisma, unusedRefreshTokens);
    });

    it("removes the user's own class and subclass, keeps the shared class and the other user's subclass, then clears that with its author", async () => {
      const [authorA, authorB] = await Promise.all([
        ctx.prisma.user.create({
          data: { username: `veg509-a-${RUN}`, passwordHash: 'x', displayName: 'A' },
        }),
        ctx.prisma.user.create({
          data: { username: `veg509-b-${RUN}`, passwordHash: 'x', displayName: 'B' },
        }),
      ]);
      const actorA = { userId: authorA.id, isAdmin: false };
      const [ownClassOfA, sharedClass] = await Promise.all([
        ctx.prisma.srdClass.create({
          data: {
            name: `Veg509 A Own Class ${RUN}`,
            hitDie: 'd8',
            contentSource: 'homebrew',
            createdById: authorA.id,
            source: HOMEBREW_SOURCE_LABEL,
          },
        }),
        ctx.prisma.srdClass.create({
          data: {
            name: `Veg509 Shared By A ${RUN}`,
            hitDie: 'd10',
            contentSource: 'shared',
            createdById: authorA.id,
            source: SHARED_SOURCE_LABEL,
          },
        }),
      ]);
      const [ownSubOfA, subOfB] = await Promise.all([
        service.create(
          { name: `Veg509 A Own Path ${RUN}`, classId: ownClassOfA.id } as never,
          actorA
        ),
        service.create({ name: `Veg509 B Path ${RUN}`, classId: sharedClass.id } as never, {
          userId: authorB.id,
          isAdmin: false,
        }),
      ]);

      await users.remove(authorA.id);

      expect(await ctx.prisma.subclass.count({ where: { id: ownSubOfA.id } })).toBe(0);
      expect(await ctx.prisma.srdClass.count({ where: { id: ownClassOfA.id } })).toBe(0);
      // The shared class survives its author via the SET NULL FK, so B's
      // subclass still has a parent to point at.
      const survivor = await ctx.prisma.srdClass.findUniqueOrThrow({
        where: { id: sharedClass.id },
      });
      expect(survivor.createdById).toBeNull();
      expect(await ctx.prisma.subclass.count({ where: { id: subOfB.id } })).toBe(1);

      await users.remove(authorB.id);

      expect(await ctx.prisma.subclass.count({ where: { id: subOfB.id } })).toBe(0);
    });

    // The error shape `UsersService.remove` retries on, measured rather than
    // inferred. A subclass added under a class the content pass never deletes
    // (an SRD one here) survives to `user.delete`, where ON DELETE SET NULL
    // nulls its creator and `subclasses_homebrew_has_creator_check` refuses the
    // row. Deleting the user directly reproduces that final statement without
    // racing anything. The predicate reads the class, not a code, and this is
    // what says the class is the right thing to read.
    it('raises a CHECK violation the retry predicate recognizes', async () => {
      const author = await ctx.prisma.user.create({
        data: { username: `veg559-check-${RUN}`, passwordHash: 'x', displayName: 'C' },
      });
      const sub = await service.create(
        { name: `Veg559 Check Path ${RUN}`, classId: srdClassId } as never,
        { userId: author.id, isAdmin: false }
      );

      const err = await ctx.prisma.user
        .delete({ where: { id: author.id } })
        .then(() => null)
        .catch((e: unknown) => e);

      // Postgres 16 through Prisma 6.19.2. SQLSTATE 23514 arrives with no
      // Prisma error code at all, so anything keyed on a code (P2004 among
      // them) would miss it. The SQLSTATE and the constraint name survive only
      // in the message text.
      expect(err).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
      expect(err).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((err as { code?: unknown }).code).toBeUndefined();
      expect((err as Error).message).toContain('23514');
      expect((err as Error).message).toContain('subclasses_homebrew_has_creator_check');
      expect(isConcurrentWriteConflict(err)).toBe(true);

      // The service's own path clears both rows, since it deletes the subclass
      // before the user.
      await users.remove(author.id);
      expect(await ctx.prisma.subclass.count({ where: { id: sub.id } })).toBe(0);
    });
  });

  /**
   * Two features-only PATCHes on one subclass, overlapping. The parent update in
   * each carries no columns, which Prisma runs as a SELECT that locks nothing, so
   * without the parent row lock the second transaction's delete waits on the
   * first one's deleted rows, cannot see the first one's insert once it commits,
   * deletes nothing, and adds its own list beside the first. The lock makes the
   * second wait at the parent instead, and its delete then sees the first list.
   */
  describe('two overlapping features-only updates', () => {
    it('end with exactly one of the two lists, never both, and neither conflicts', async () => {
      const sub = await service.create(
        {
          name: `Veg509 Contended Path ${RUN}`,
          classId: srdClassId,
          features: [{ name: 'Veg509 Original', level: 3 }],
        } as never,
        owner
      );
      const listA = [
        { name: 'Veg509 First A', level: 3 },
        { name: 'Veg509 First B', level: 6 },
      ];
      const listB = [{ name: 'Veg509 Second A', level: 3 }];

      let signalWritten!: () => void;
      const firstHasWritten = new Promise<void>(resolve => (signalWritten = resolve));
      let releaseFirst!: () => void;
      const firstReleased = new Promise<void>(resolve => (releaseFirst = resolve));
      const pausing = pauseAfterFeatureInsert(ctx.prisma, async () => {
        signalWritten();
        await firstReleased;
      });
      const first = new HomebrewSubclassesService(pausing, new ContentAccessService());

      const t1 = first.update(sub.id, { features: listA } as never, owner);
      // Surface a T1 failure instead of waiting forever for a pause it never reached.
      await Promise.race([
        firstHasWritten,
        t1.then(() => Promise.reject(new Error('The first update finished without pausing'))),
      ]);

      const t2 = service.update(sub.id, { features: listB } as never, owner);
      await waitForBlockedSession(ctx.prisma);
      releaseFirst();

      await expect(Promise.all([t1, t2])).resolves.toHaveLength(2);

      const names = (
        await ctx.prisma.subclassFeature.findMany({
          where: { subclassId: sub.id },
          orderBy: [{ level: 'asc' }, { name: 'asc' }],
        })
      ).map(f => f.name);
      expect([listA.map(f => f.name), listB.map(f => f.name)]).toContainEqual(names);
    });
  });
});
