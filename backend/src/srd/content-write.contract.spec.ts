import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import type { Type } from '@nestjs/common';
import { ContentAccessService, ContentActor, OwnedContentRow } from './content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from './content-crud.base';
import { SrdModule } from './srd.module';
import { AdminModule } from '../admin/admin.module';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { HomebrewSpellsService } from './homebrew-spells.service';
import { HomebrewFeatsService } from './homebrew-feats.service';
import { HomebrewItemsService } from './homebrew-items.service';
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import { AdminItemsService } from '../admin/items/admin-items.service';

/**
 * The tiered-content write contract (VEG-336), asserted identically against
 * every service that writes `srd`/`shared`/`homebrew` rows.
 *
 * These six services each carry the same authorization skeleton: authorize the
 * create tier, load-and-guard before any update or delete, force the ownership
 * stamp, and map Prisma's write errors to tier-appropriate HTTP semantics.
 * Until now that skeleton was asserted once per clone, which is exactly the
 * shape of coverage that cannot catch drift: a copy that loses its 404-vs-403
 * split keeps passing its own spec. Driving one table of cases through every
 * service means a service that stops honouring the contract fails here even if
 * its own spec still passes.
 *
 * The suite deliberately drives the services through their public API rather
 * than any shared internal, so it is agnostic to how the skeleton is factored.
 * That is what lets it run green before the refactor, stay green through it,
 * and keep guarding the result afterwards.
 *
 * Per-entity behavior (column normalization, referential cleanup, origin-feat
 * guards) is NOT asserted here; it stays in each service's own spec.
 */

const OWNER: ContentActor = { userId: 'owner-1', isAdmin: false };
const STRANGER: ContentActor = { userId: 'stranger-1', isAdmin: false };
const ADMIN: ContentActor = { userId: 'admin-1', isAdmin: true };

/** Structural view of the write methods every tiered service exposes. */
interface TieredWriteService {
  create(dto: never, actor: ContentActor): Promise<unknown>;
  update(id: string, dto: never, actor: ContentActor): Promise<unknown>;
  remove(id: string, actor: ContentActor): Promise<void>;
}

/** Prisma model keys the mock factory exposes, narrowed to the tiered entities. */
type TieredModel = 'monster' | 'spell' | 'feat' | 'item' | 'background';

interface ContractCase {
  /** Display name for the describe block. */
  title: string;
  Service: Type<unknown>;
  /** Which delegate on the mock the service writes through. */
  model: TieredModel;
  /** Lowercase entity name used in user-facing error copy. */
  noun: string;
  tier: 'homebrew' | 'shared';
  /** Value the service stamps into the legacy `source` column. */
  sourceLabel: string;
  /** Minimal valid create payload; no entity-specific extras. */
  makeCreateDto(): Record<string, unknown>;
  /**
   * Extra columns the loaded row must carry for this entity's guards to take
   * their no-op path (backgrounds reads `originFeatId` off the row).
   */
  rowExtras?: Record<string, unknown>;
}

const CASES: ContractCase[] = [
  {
    title: 'HomebrewMonstersService',
    Service: HomebrewMonstersService,
    model: 'monster',
    noun: 'monster',
    tier: 'homebrew',
    sourceLabel: 'Homebrew',
    makeCreateDto: () => ({ name: 'Dire Badger', size: 'Medium', type: 'beast' }),
  },
  {
    title: 'HomebrewSpellsService',
    Service: HomebrewSpellsService,
    model: 'spell',
    noun: 'spell',
    tier: 'homebrew',
    sourceLabel: 'Homebrew',
    makeCreateDto: () => ({ name: 'Mending Word', level: 1, school: 'Evocation' }),
  },
  {
    title: 'HomebrewFeatsService',
    Service: HomebrewFeatsService,
    model: 'feat',
    noun: 'feat',
    tier: 'homebrew',
    sourceLabel: 'Homebrew',
    makeCreateDto: () => ({ name: 'Shield Master', description: 'Offense from defense.' }),
  },
  {
    title: 'HomebrewItemsService',
    Service: HomebrewItemsService,
    model: 'item',
    noun: 'item',
    tier: 'homebrew',
    sourceLabel: 'Homebrew',
    makeCreateDto: () => ({ name: 'Sunblade', category: 'Weapon' }),
  },
  {
    title: 'HomebrewBackgroundsService',
    Service: HomebrewBackgroundsService,
    model: 'background',
    noun: 'background',
    tier: 'homebrew',
    sourceLabel: 'Homebrew',
    makeCreateDto: () => ({ name: 'Sky Pilot', description: 'You flew the mail runs.' }),
    rowExtras: { originFeatId: null, originFeatOption: null },
  },
  {
    title: 'AdminItemsService (shared tier)',
    Service: AdminItemsService,
    model: 'item',
    noun: 'item',
    tier: 'shared',
    sourceLabel: 'Shared',
    makeCreateDto: () => ({ name: 'Explorer’s Pack', category: 'Equipment Pack' }),
  },
];

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

describe.each(CASES)(
  'tiered write contract: $title',
  ({ Service, model, noun, tier, sourceLabel, makeCreateDto, rowExtras }) => {
    let service: TieredWriteService;
    let prisma: MockPrismaService;
    let delegate: MockPrismaService[TieredModel];

    /** The actor allowed to create at this tier: anyone for homebrew, admins for shared. */
    const creator = tier === 'shared' ? ADMIN : OWNER;
    /** An actor who may NOT create at this tier, or null when everyone may. */
    const nonCreator = tier === 'shared' ? OWNER : null;

    const ownRow = () => ({
      id: 'row-1',
      contentSource: 'homebrew',
      createdById: OWNER.userId,
      ...rowExtras,
    });
    const sharedRow = () => ({
      id: 'row-1',
      contentSource: 'shared',
      createdById: 'someone-else',
      ...rowExtras,
    });
    const srdRow = () => ({
      id: 'row-1',
      contentSource: 'srd',
      createdById: null,
      ...rowExtras,
    });

    /** The actor who owns `ownRow()` at this tier and may edit it. */
    const editor = tier === 'shared' ? ADMIN : OWNER;
    const editableRow = tier === 'shared' ? sharedRow : ownRow;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [Service, ContentAccessService, prismaMockProvider()],
      }).compile();

      service = module.get<TieredWriteService>(Service as Type<TieredWriteService>);
      prisma = module.get<MockPrismaService>(PrismaService as never);
      delegate = prisma[model];
    });

    describe('create', () => {
      it(`stamps contentSource "${tier}", the owner, and source "${sourceLabel}"`, async () => {
        delegate.create.mockResolvedValue({ id: 'row-1' });

        await service.create(makeCreateDto() as never, creator);

        expect(delegate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            contentSource: tier,
            createdById: creator.userId,
            source: sourceLabel,
          }),
        });
      });

      it('overrides client-supplied ownership and tier fields with the server stamp', async () => {
        delegate.create.mockResolvedValue({ id: 'row-1' });

        await service.create(
          {
            ...makeCreateDto(),
            contentSource: 'srd',
            createdById: 'evil',
            source: 'Player’s Handbook',
            id: 'forced-id',
            campaignId: 'some-campaign',
            // Prisma's relation form writes createdById without that string
            // ever appearing in the payload.
            createdBy: { connect: { id: 'evil' } },
          } as never,
          creator
        );

        const data = delegate.create.mock.calls[0][0].data;
        expect(data.contentSource).toBe(tier);
        expect(data.createdById).toBe(creator.userId);
        expect(data.source).toBe(sourceLabel);
        expect(data).not.toHaveProperty('id');
        // campaignId is reserved for per-campaign scoping and is not consulted
        // yet, which is exactly why it needs pinning now: an unasserted entry in
        // the reserved list is one a typo could drop unnoticed.
        expect(data).not.toHaveProperty('campaignId');
        expect(data).not.toHaveProperty('createdBy');
      });

      it(`maps a duplicate-name P2002 to 409 with ${tier}-tier copy`, async () => {
        delegate.create.mockRejectedValue(p2002());

        const expected =
          tier === 'shared'
            ? `A shared ${noun} with this name already exists`
            : `You already have ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} with this name`;

        await expect(service.create(makeCreateDto() as never, creator)).rejects.toThrow(expected);
      });

      it('leaves the caller\u2019s DTO untouched', async () => {
        delegate.create.mockResolvedValue({ id: 'row-1' });
        const dto = { ...makeCreateDto(), contentSource: 'srd', id: 'forced-id' };
        const before = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;

        await service.create(dto as never, creator);

        // The mappings changed from a rest-destructure, which could not touch
        // the input, to spread-then-delete, which can. The controller still
        // holds this object after the call returns.
        expect(dto).toEqual(before);
      });

      it('rethrows unknown write errors untouched', async () => {
        delegate.create.mockRejectedValue(new Error('connection reset'));

        await expect(service.create(makeCreateDto() as never, creator)).rejects.toThrow(
          'connection reset'
        );
      });

      if (nonCreator) {
        it('forbids a non-admin from creating at the shared tier', async () => {
          await expect(service.create(makeCreateDto() as never, nonCreator)).rejects.toThrow(
            ForbiddenException
          );
          expect(delegate.create).not.toHaveBeenCalled();
        });
      } else {
        it('lets any authenticated user create their own homebrew', async () => {
          delegate.create.mockResolvedValue({ id: 'row-1' });

          await expect(service.create(makeCreateDto() as never, STRANGER)).resolves.toBeDefined();
          expect(delegate.create).toHaveBeenCalled();
        });
      }
    });

    describe('update', () => {
      it('updates a row the actor may write', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.update.mockResolvedValue({ ...editableRow(), name: 'Renamed' });

        await service.update('row-1', { name: 'Renamed' } as never, editor);

        expect(delegate.update).toHaveBeenCalledWith({
          where: { id: 'row-1' },
          data: expect.objectContaining({ name: 'Renamed' }),
        });
      });

      it('throws NotFound when the row does not exist', async () => {
        delegate.findUnique.mockResolvedValue(null);

        await expect(service.update('nope', { name: 'X' } as never, editor)).rejects.toThrow(
          NotFoundException
        );
        expect(delegate.update).not.toHaveBeenCalled();
      });

      it('throws NotFound (not Forbidden) for another user’s homebrew — existence must not leak', async () => {
        delegate.findUnique.mockResolvedValue(ownRow());

        await expect(service.update('row-1', { name: 'X' } as never, STRANGER)).rejects.toThrow(
          NotFoundException
        );
        expect(delegate.update).not.toHaveBeenCalled();
      });

      it('throws Forbidden for SRD rows — visible but immutable', async () => {
        delegate.findUnique.mockResolvedValue(srdRow());

        await expect(service.update('row-1', { name: 'X' } as never, ADMIN)).rejects.toThrow(
          ForbiddenException
        );
        expect(delegate.update).not.toHaveBeenCalled();
      });

      it('forbids non-admins from editing shared rows but allows admins', async () => {
        delegate.findUnique.mockResolvedValue(sharedRow());

        await expect(service.update('row-1', { name: 'X' } as never, OWNER)).rejects.toThrow(
          ForbiddenException
        );

        delegate.update.mockResolvedValue({ ...sharedRow(), name: 'X' });
        await expect(service.update('row-1', { name: 'X' } as never, ADMIN)).resolves.toBeDefined();
      });

      it('never lets an update rewrite ownership or tier columns', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.update.mockResolvedValue(editableRow());

        await service.update(
          'row-1',
          {
            name: 'X',
            contentSource: 'srd',
            createdById: 'evil',
            source: 'Forged',
            campaignId: 'some-campaign',
            id: 'forced-id',
            createdBy: { connect: { id: 'evil' } },
          } as never,
          editor
        );

        const data = delegate.update.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('contentSource');
        expect(data).not.toHaveProperty('createdById');
        expect(data).not.toHaveProperty('source');
        expect(data).not.toHaveProperty('campaignId');
        expect(data).not.toHaveProperty('id');
        expect(data).not.toHaveProperty('createdBy');
      });

      it('maps a concurrent-delete P2025 to NotFound rather than a 500', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.update.mockRejectedValue(p2025());

        await expect(service.update('row-1', { name: 'X' } as never, editor)).rejects.toThrow(
          NotFoundException
        );
      });

      it('keys the conflict copy to the loaded row’s tier, not the service default', async () => {
        delegate.findUnique.mockResolvedValue(sharedRow());
        delegate.update.mockRejectedValue(p2002());

        await expect(service.update('row-1', { name: 'Dup' } as never, ADMIN)).rejects.toThrow(
          `A shared ${noun} with this name already exists`
        );
      });

      it('maps a duplicate-name P2002 on update to Conflict', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.update.mockRejectedValue(p2002());

        await expect(service.update('row-1', { name: 'Dup' } as never, editor)).rejects.toThrow(
          ConflictException
        );
      });
    });

    describe('remove', () => {
      it('deletes a row the actor may write', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.delete.mockResolvedValue(editableRow());

        await service.remove('row-1', editor);

        expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 'row-1' } });
      });

      it('throws NotFound when the row does not exist', async () => {
        delegate.findUnique.mockResolvedValue(null);

        await expect(service.remove('nope', editor)).rejects.toThrow(NotFoundException);
        expect(delegate.delete).not.toHaveBeenCalled();
      });

      it('throws NotFound for another user’s homebrew without deleting', async () => {
        delegate.findUnique.mockResolvedValue(ownRow());

        await expect(service.remove('row-1', STRANGER)).rejects.toThrow(NotFoundException);
        expect(delegate.delete).not.toHaveBeenCalled();
      });

      it('throws Forbidden for SRD rows', async () => {
        delegate.findUnique.mockResolvedValue(srdRow());

        await expect(service.remove('row-1', ADMIN)).rejects.toThrow(ForbiddenException);
        expect(delegate.delete).not.toHaveBeenCalled();
      });

      it('maps a concurrent-delete P2025 to NotFound rather than a 500', async () => {
        delegate.findUnique.mockResolvedValue(editableRow());
        delegate.delete.mockRejectedValue(p2025());

        await expect(service.remove('row-1', editor)).rejects.toThrow(NotFoundException);
      });

      it('keys remove\u2019s conflict copy to the loaded row\u2019s tier, not the service default', async () => {
        // The same invariant update pins. Without this, changing remove's
        // mapWriteError to `this.tier` breaks nothing: an admin deleting a
        // shared row through a homebrew-tier service would get homebrew copy.
        delegate.findUnique.mockResolvedValue(sharedRow());
        delegate.delete.mockRejectedValue(p2002());

        await expect(service.remove('row-1', ADMIN)).rejects.toThrow(
          `A shared ${noun} with this name already exists`
        );
      });
    });
  }
);

/**
 * Enrollment guard: every service that inherits the write skeleton must be
 * covered by the contract above.
 *
 * Without this, the contract is only as good as the next author's memory. The
 * whole point of VEG-336 is that a seventh tiered service (VEG-506 homebrew
 * classes, VEG-509 subclasses) should not be able to reintroduce the drift this
 * refactor removed, and a service that quietly skips the case table would be
 * exactly that. Subclass detection walks the prototype chain rather than
 * matching on class names, so a service named outside any convention is still
 * caught.
 */
describe('contract enrollment', () => {
  /** Whether `cls` extends ContentCrudService anywhere up its prototype chain. */
  function extendsContentCrud(cls: unknown): boolean {
    let proto: unknown = cls;
    while (typeof proto === 'function' && proto !== Function.prototype) {
      proto = Object.getPrototypeOf(proto);
      if (proto === ContentCrudService) return true;
    }
    return false;
  }

  /**
   * Provider classes registered on a module.
   *
   * Nest providers come in several shapes; a bare class and `{ provide, useClass }`
   * both register a class, and only reading the bare form would make a service
   * invisible to this guard by the trivial act of registering it with a token.
   */
  function providerClassesOf(module: unknown): unknown[] {
    const raw = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module as object) ??
      []) as unknown[];
    return raw.map(entry => {
      if (typeof entry === 'function') return entry;
      const useClass = (entry as { useClass?: unknown } | null)?.useClass;
      return typeof useClass === 'function' ? useClass : entry;
    });
  }

  const MODULES: [string, unknown][] = [
    ['SrdModule', SrdModule],
    ['AdminModule', AdminModule],
  ];

  /**
   * Fail-closed control.
   *
   * `expect(unenrolled).toEqual([])` passes just as happily when the metadata
   * lookup finds nothing at all, so on its own the guard below cannot tell
   * "every service is enrolled" from "I read the wrong key and saw zero
   * providers". This pins that the reflection actually works, which is the
   * assumption the rest of this block rests on.
   */
  it.each(MODULES)('reads real providers off %s', (_name, module) => {
    const providers = providerClassesOf(module);
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.filter(extendsContentCrud).length).toBeGreaterThan(0);
  });

  it('finds every service the case table claims to cover', () => {
    const discovered = new Set(MODULES.flatMap(([, m]) => providerClassesOf(m)));
    const missing = CASES.map(c => c.Service).filter(service => !discovered.has(service));

    expect(missing.map(s => s.name)).toEqual([]);
  });

  it.each(MODULES)(
    'every ContentCrudService subclass registered in %s is enrolled',
    (_name, module) => {
      const enrolled = new Set(CASES.map(c => c.Service));
      const unenrolled = providerClassesOf(module)
        .filter(extendsContentCrud)
        .filter(provider => !enrolled.has(provider as Type<unknown>))
        .map(provider => (provider as Type<unknown>).name);

      expect(unenrolled).toEqual([]);
    }
  );

  it('detects subclasses by prototype chain, not by name', () => {
    class RenamedEntirely extends ContentCrudService<never, never, never> {
      protected readonly tier = 'homebrew' as const;
      protected readonly noun = 'thing';
      protected get delegate(): never {
        throw new Error('unused');
      }
      protected toColumnData(): never {
        throw new Error('unused');
      }
    }

    expect(extendsContentCrud(RenamedEntirely)).toBe(true);
    expect(extendsContentCrud(ContentAccessService)).toBe(false);
  });

  it('resolves a useClass provider to its class', () => {
    expect(providerClassesOf({ __probe: true })).toEqual([]);
    const asToken = [{ provide: 'TOKEN', useClass: HomebrewFeatsService }];
    const resolved = asToken.map(e => (typeof e.useClass === 'function' ? e.useClass : e));
    expect(resolved.filter(extendsContentCrud)).toEqual([HomebrewFeatsService]);
  });
});

/**
 * The skeleton is not overridable, enforced where an ESLint selector cannot reach.
 *
 * The lint rule matches method definitions on classes whose immediate superclass
 * is named ContentCrudService. That misses two real shapes: a class FIELD
 * (`update = async () => {}`) shadows the prototype method entirely, and a
 * grandchild (or an intermediate abstract base, which VEG-506/509 may well add)
 * is not a direct subclass at all. Both bypass authorization with lint green.
 *
 * Walking the prototype chain catches every depth, and checking the constructed
 * instance catches fields, so this holds whatever the selector misses. It also
 * means the lint rule is fast feedback rather than the load-bearing guard, which
 * matters because flat config merges `no-restricted-syntax` by name: a later
 * config object declaring its own would silently drop ours.
 */
describe('skeleton integrity', () => {
  const SKELETON_MEMBERS = ['create', 'update', 'remove', 'findWritableRow'] as const;

  /** Skeleton members redefined anywhere between `cls` and ContentCrudService. */
  function shadowedOnPrototypeChain(cls: Type<unknown>): string[] {
    const found: string[] = [];
    let proto: object | null = cls.prototype as object;
    while (proto && proto !== ContentCrudService.prototype) {
      for (const member of SKELETON_MEMBERS) {
        if (Object.prototype.hasOwnProperty.call(proto, member)) found.push(member);
      }
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return found;
  }

  it.each(CASES.map(c => [c.title, c.Service] as const))(
    '%s does not redefine a skeleton method',
    (_title, Service) => {
      expect(shadowedOnPrototypeChain(Service)).toEqual([]);
    }
  );

  it.each(CASES.map(c => [c.title, c.Service] as const))(
    '%s does not shadow a skeleton method with an instance field',
    async (_title, Service) => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [Service, ContentAccessService, prismaMockProvider()],
      }).compile();
      const instance = module.get<object>(Service as Type<object>);

      const shadowed = SKELETON_MEMBERS.filter(member =>
        Object.prototype.hasOwnProperty.call(instance, member)
      );
      expect(shadowed).toEqual([]);
    }
  );

  it('catches both bypass shapes the lint selector misses', () => {
    class Intermediate extends ContentCrudService<never, never, never> {
      protected readonly tier = 'homebrew' as const;
      protected readonly noun = 'thing';
      protected get delegate(): never {
        throw new Error('unused');
      }
      protected toColumnData(): never {
        throw new Error('unused');
      }
    }
    // A grandchild: its immediate superclass is not ContentCrudService, so the
    // lint selector never looks at it.
    class Grandchild extends Intermediate {
      async remove(): Promise<void> {}
    }
    expect(shadowedOnPrototypeChain(Grandchild)).toContain('remove');

    // A field rather than a method: same name, shadows the prototype entirely.
    class FieldShadow extends Intermediate {
      // The probe mirrors the real async signature; awaiting anything would defeat it.
      // eslint-disable-next-line @typescript-eslint/require-await
      update = async (): Promise<never> => {
        throw new Error('bypassed');
      };
    }
    const shadowed = SKELETON_MEMBERS.filter(m =>
      Object.prototype.hasOwnProperty.call(new FieldShadow(null as never, null as never), m)
    );
    expect(shadowed).toContain('update');
  });
});

/**
 * The two extension points `update` offers a subclass, driven through a probe
 * rather than the six real services, none of which override either today.
 *
 * `performUpdate` exists so an entity whose update must span child rows can do
 * that inside the authorized sequence instead of hand-rolling a transaction
 * outside it (VEG-512, ahead of the per-level class features in VEG-507). The
 * hooks return their column data so that an override written in the natural
 * immutable style cannot silently no-op.
 */
describe('update extension points', () => {
  interface ProbeRow extends OwnedContentRow {
    id: string;
  }

  const homebrewRow = (): ProbeRow => ({
    id: 'row-1',
    contentSource: 'homebrew',
    createdById: OWNER.userId,
  });

  function makeDelegate() {
    return {
      findUnique: jest.fn().mockResolvedValue(homebrewRow()),
      create: jest.fn().mockResolvedValue(homebrewRow()),
      update: jest.fn().mockResolvedValue(homebrewRow()),
      delete: jest.fn().mockResolvedValue(homebrewRow()),
    };
  }

  type ProbeDelegate = ReturnType<typeof makeDelegate>;

  class Probe extends ContentCrudService<ProbeRow, Record<string, never>, Record<string, never>> {
    protected readonly tier = 'homebrew' as const;
    protected readonly noun = 'probe';

    constructor(private readonly mock: ProbeDelegate) {
      super(null as never, new ContentAccessService());
    }

    protected get delegate(): ContentWriteDelegate<ProbeRow> {
      return this.mock as unknown as ContentWriteDelegate<ProbeRow>;
    }

    protected toColumnData(dto: object): ColumnData {
      return { ...dto };
    }
  }

  describe('performUpdate', () => {
    it('defaults to a plain delegate update', async () => {
      const mock = makeDelegate();
      await new Probe(mock).update('row-1', { name: 'X' } as never, OWNER);

      expect(mock.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { name: 'X' } });
    });

    it('lets an override replace the write, and returns what the override returns', async () => {
      const mock = makeDelegate();
      const replaced: ProbeRow = { ...homebrewRow(), createdById: 'rewritten' };
      class TxProbe extends Probe {
        protected override performUpdate(): Promise<ProbeRow> {
          return Promise.resolve(replaced);
        }
      }

      await expect(new TxProbe(mock).update('row-1', { name: 'X' } as never, OWNER)).resolves.toBe(
        replaced
      );
      expect(mock.update).not.toHaveBeenCalled();
    });

    it('runs inside the guard: an unwritable row never reaches it', async () => {
      const mock = makeDelegate();
      mock.findUnique.mockResolvedValue({ id: 'row-1', contentSource: 'srd', createdById: null });
      let reached = false;
      class TxProbe extends Probe {
        protected override async performUpdate(id: string, data: ColumnData): Promise<ProbeRow> {
          reached = true;
          return super.performUpdate(id, data);
        }
      }

      await expect(
        new TxProbe(mock).update('row-1', { name: 'X' } as never, ADMIN)
      ).rejects.toThrow(ForbiddenException);
      expect(reached).toBe(false);
    });

    it("maps a failure inside the override to the loaded row's tier, not the service's", async () => {
      const mock = makeDelegate();
      mock.findUnique.mockResolvedValue({
        id: 'row-1',
        contentSource: 'shared',
        createdById: 'someone-else',
      });
      class TxProbe extends Probe {
        protected override performUpdate(): Promise<ProbeRow> {
          return Promise.reject(p2002());
        }
      }

      // The probe's own tier is homebrew, which would say "You already have a probe...".
      await expect(
        new TxProbe(mock).update('row-1', { name: 'X' } as never, ADMIN)
      ).rejects.toThrow('A shared probe with this name already exists');
    });
  });

  describe('hook return values', () => {
    it('honours a beforeUpdate that returns a new object instead of mutating', async () => {
      const mock = makeDelegate();
      class HookProbe extends Probe {
        protected override beforeUpdate(data: ColumnData): ColumnData {
          return { ...data, derived: 'yes' };
        }
      }

      await new HookProbe(mock).update('row-1', { name: 'X' } as never, OWNER);

      expect(mock.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { name: 'X', derived: 'yes' },
      });
    });

    it('honours a beforeCreate that returns a new object instead of mutating', async () => {
      const mock = makeDelegate();
      class HookProbe extends Probe {
        protected override beforeCreate(data: ColumnData): ColumnData {
          return { ...data, derived: 'yes' };
        }
      }

      await new HookProbe(mock).create({ name: 'X' } as never, OWNER);

      expect(mock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'X', derived: 'yes' }),
      });
    });

    it('strips reserved columns from what the hook returned, not just from what it was given', async () => {
      const mock = makeDelegate();
      class EscalatingProbe extends Probe {
        protected override beforeUpdate(data: ColumnData): ColumnData {
          // A replacement object carrying an escalation. The pre-hook strip never
          // saw these keys, so only a post-hook strip of the RETURNED object stops them.
          return { ...data, contentSource: 'srd', createdById: 'someone-else', id: 'other-row' };
        }
      }

      await new EscalatingProbe(mock).update('row-1', { name: 'X' } as never, OWNER);

      expect(mock.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { name: 'X' } });
    });
  });
});
