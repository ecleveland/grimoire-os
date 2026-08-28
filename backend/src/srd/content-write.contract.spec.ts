import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import type { Type } from '@nestjs/common';
import { ContentAccessService, ContentActor } from './content-access.service';
import { ContentCrudService } from './content-crud.base';
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

/** Structural view of the write surface every tiered service exposes. */
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
          } as never,
          creator
        );

        const data = delegate.create.mock.calls[0][0].data;
        expect(data.contentSource).toBe(tier);
        expect(data.createdById).toBe(creator.userId);
        expect(data.source).toBe(sourceLabel);
        expect(data).not.toHaveProperty('id');
      });

      it(`maps a duplicate-name P2002 to 409 with ${tier}-tier copy`, async () => {
        delegate.create.mockRejectedValue(p2002());

        const expected =
          tier === 'shared'
            ? `A shared ${noun} with this name already exists`
            : `You already have ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} with this name`;

        await expect(service.create(makeCreateDto() as never, creator)).rejects.toThrow(expected);
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
          { name: 'X', contentSource: 'srd', createdById: 'evil', source: 'Forged' } as never,
          editor
        );

        const data = delegate.update.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('contentSource');
        expect(data).not.toHaveProperty('createdById');
        expect(data).not.toHaveProperty('source');
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

  function providersOf(module: unknown): unknown[] {
    return (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module as object) ?? []) as unknown[];
  }

  it.each([
    ['SrdModule', SrdModule],
    ['AdminModule', AdminModule],
  ])('every ContentCrudService subclass registered in %s is in the case table', (_name, module) => {
    const enrolled = new Set(CASES.map(c => c.Service));
    const unenrolled = providersOf(module)
      .filter(extendsContentCrud)
      .filter(provider => !enrolled.has(provider as Type<unknown>))
      .map(provider => (provider as Type<unknown>).name);

    expect(unenrolled).toEqual([]);
  });

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
});
