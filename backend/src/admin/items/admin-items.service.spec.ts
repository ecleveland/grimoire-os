import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminItemsService } from './admin-items.service';
import { ContentAccessService } from '../../srd/content-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../../test/prisma-mock.factory';
import { CreateItemDto } from '../../srd/dto/create-item.dto';

const ADMIN = { userId: 'admin-1', isAdmin: true };
const PLAYER = { userId: 'player-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateItemDto> = {}): CreateItemDto {
  return {
    name: "Explorer's Pack",
    category: 'Equipment Pack',
    ...over,
  } as CreateItemDto;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AdminItemsService', () => {
  let service: AdminItemsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminItemsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(AdminItemsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('list', () => {
    it('lists only shared-tier rows, paginated, newest filters applied', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'i1', name: 'A' }]);
      prisma.item.count.mockResolvedValue(1);

      const res = await service.list({ category: 'Trade Goods', q: 'silk', page: 2, limit: 10 });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          contentSource: 'shared',
          category: 'Trade Goods',
          name: { contains: 'silk', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        skip: 10,
        take: 10,
      });
      expect(res).toEqual({ data: [{ id: 'i1', name: 'A' }], total: 1, page: 2, lastPage: 1 });
    });

    it('defaults to page 1 / limit 20 and omits optional filters', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.list({});

      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contentSource: 'shared' }, skip: 0, take: 20 })
      );
    });
  });

  describe('create', () => {
    it('creates a shared item stamped by the admin actor', async () => {
      const created = { id: 'i1', name: "Explorer's Pack" };
      prisma.item.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), ADMIN);

      expect(prisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Explorer's Pack",
          contentSource: 'shared',
          createdById: 'admin-1',
          source: 'Shared',
        }),
      });
      expect(result).toEqual(created);
    });

    it('forbids non-admins from creating shared items', async () => {
      await expect(service.create(makeCreateDto(), PLAYER)).rejects.toThrow(ForbiddenException);
      expect(prisma.item.create).not.toHaveBeenCalled();
    });

    it('never lets the client set ownership/tier fields', async () => {
      prisma.item.create.mockResolvedValue({ id: 'i1' });

      await service.create(
        makeCreateDto({ contentSource: 'srd', createdById: 'evil', id: 'forged' } as never),
        ADMIN
      );

      const data = prisma.item.create.mock.calls[0][0].data;
      expect(data.contentSource).toBe('shared');
      expect(data.createdById).toBe('admin-1');
      expect(data).not.toHaveProperty('id');
    });

    it('maps a duplicate-name P2002 to a shared-tier ConflictException', async () => {
      prisma.item.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), ADMIN)).rejects.toThrow(
        'A shared item with this name already exists'
      );
    });
  });

  describe('update', () => {
    const sharedRow = { id: 'i1', contentSource: 'shared', createdById: 'admin-9' };

    it('updates a shared row for an admin', async () => {
      prisma.item.findUnique.mockResolvedValue(sharedRow);
      prisma.item.update.mockResolvedValue({ ...sharedRow, name: 'Renamed' });

      const result = await service.update('i1', { name: 'Renamed' }, ADMIN);

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: expect.objectContaining({ name: 'Renamed' }),
      });
      expect(result).toEqual(expect.objectContaining({ name: 'Renamed' }));
    });

    it('forbids non-admins from editing shared rows', async () => {
      prisma.item.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('i1', { name: 'X' }, PLAYER)).rejects.toThrow(ForbiddenException);
      expect(prisma.item.update).not.toHaveBeenCalled();
    });

    it('forbids editing SRD rows even for admins (immutable)', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, ADMIN)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the row does not exist', async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('strips ownership/tier fields from the update payload', async () => {
      prisma.item.findUnique.mockResolvedValue(sharedRow);
      prisma.item.update.mockResolvedValue(sharedRow);

      await service.update(
        'i1',
        { name: 'X', contentSource: 'srd', createdById: 'evil' } as never,
        ADMIN
      );

      const data = prisma.item.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it('maps a concurrent-delete P2025 to NotFound', async () => {
      prisma.item.findUnique.mockResolvedValue(sharedRow);
      prisma.item.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' })
      );

      await expect(service.update('i1', { name: 'X' }, ADMIN)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const sharedRow = { id: 'i1', contentSource: 'shared', createdById: 'admin-9' };

    it('deletes a shared row for an admin', async () => {
      prisma.item.findUnique.mockResolvedValue(sharedRow);
      prisma.item.delete.mockResolvedValue(sharedRow);

      await service.remove('i1', ADMIN);

      expect(prisma.item.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('forbids deleting SRD rows', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', ADMIN)).rejects.toThrow(ForbiddenException);
      expect(prisma.item.delete).not.toHaveBeenCalled();
    });
  });

  describe('setBundleContents', () => {
    const pack = {
      id: 'pack-1',
      category: 'Equipment Pack',
      contentSource: 'shared',
      createdById: 'admin-9',
    };

    beforeEach(() => {
      prisma.item.findUnique.mockResolvedValue(pack);
    });

    it('rewrites the bundle entries (delete then recreate) and returns resolved contents', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'c1', name: 'Candle' },
        { id: 'c2', name: 'Rope' },
      ]);

      const result = await service.setBundleContents(
        'pack-1',
        [
          { itemId: 'c1', quantity: 10 },
          { itemId: 'c2', quantity: 1 },
        ],
        ADMIN
      );

      expect(prisma.itemBundleEntry.deleteMany).toHaveBeenCalledWith({
        where: { bundleId: 'pack-1' },
      });
      expect(prisma.itemBundleEntry.createMany).toHaveBeenCalledWith({
        data: [
          { bundleId: 'pack-1', componentId: 'c1', quantity: 10 },
          { bundleId: 'pack-1', componentId: 'c2', quantity: 1 },
        ],
      });
      expect(result.contents).toEqual([
        { itemId: 'c1', name: 'Candle', quantity: 10 },
        { itemId: 'c2', name: 'Rope', quantity: 1 },
      ]);
    });

    it('clears the bundle when given an empty set (no createMany)', async () => {
      const result = await service.setBundleContents('pack-1', [], ADMIN);

      expect(prisma.itemBundleEntry.deleteMany).toHaveBeenCalledWith({
        where: { bundleId: 'pack-1' },
      });
      expect(prisma.itemBundleEntry.createMany).not.toHaveBeenCalled();
      expect(result.contents).toEqual([]);
    });

    it('rejects a pack that contains itself', async () => {
      await expect(
        service.setBundleContents('pack-1', [{ itemId: 'pack-1', quantity: 1 }], ADMIN)
      ).rejects.toThrow('A pack cannot contain itself');
      expect(prisma.itemBundleEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects duplicate components', async () => {
      await expect(
        service.setBundleContents(
          'pack-1',
          [
            { itemId: 'c1', quantity: 1 },
            { itemId: 'c1', quantity: 2 },
          ],
          ADMIN
        )
      ).rejects.toThrow('A component can only be listed once per pack');
    });

    it('rejects components not in the global catalog', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'c1', name: 'Candle' }]); // c2 missing

      await expect(
        service.setBundleContents(
          'pack-1',
          [
            { itemId: 'c1', quantity: 1 },
            { itemId: 'c2', quantity: 1 },
          ],
          ADMIN
        )
      ).rejects.toThrow(BadRequestException);
      expect(prisma.itemBundleEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('resolves components against the global catalog (srd + shared) only', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'c1', name: 'Candle' }]);

      await service.setBundleContents('pack-1', [{ itemId: 'c1', quantity: 1 }], ADMIN);

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, contentSource: { in: ['srd', 'shared'] } },
        select: { id: true, name: true },
      });
    });

    it('forbids editing contents of an SRD pack', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'srd-pack',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(
        service.setBundleContents('srd-pack', [{ itemId: 'c1', quantity: 1 }], ADMIN)
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins', async () => {
      await expect(
        service.setBundleContents('pack-1', [{ itemId: 'c1', quantity: 1 }], PLAYER)
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects setting contents on a non-pack item', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'sword-1',
        category: 'Martial Melee Weapon',
        contentSource: 'shared',
        createdById: 'admin-9',
      });

      await expect(
        service.setBundleContents('sword-1', [{ itemId: 'c1', quantity: 1 }], ADMIN)
      ).rejects.toThrow('Only equipment packs can have contents');
      expect(prisma.itemBundleEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('maps an FK race (component deleted mid-write, P2003) to a friendly 400', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'c1', name: 'Candle' }]);
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: 'test',
        })
      );

      await expect(
        service.setBundleContents('pack-1', [{ itemId: 'c1', quantity: 1 }], ADMIN)
      ).rejects.toThrow('One or more components were removed while saving; refresh and try again');
    });

    it('maps a duplicate-entry P2002 from the write through mapWriteError', async () => {
      prisma.item.findMany.mockResolvedValue([{ id: 'c1', name: 'Candle' }]);
      prisma.$transaction.mockRejectedValueOnce(p2002());

      await expect(
        service.setBundleContents('pack-1', [{ itemId: 'c1', quantity: 1 }], ADMIN)
      ).rejects.toThrow(ConflictException);
    });
  });
});
