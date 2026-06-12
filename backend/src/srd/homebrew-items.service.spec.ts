import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewItemsService } from './homebrew-items.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateItemDto } from './dto/create-item.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };
const STRANGER = { userId: 'stranger-1', isAdmin: false };
const ADMIN = { userId: 'admin-1', isAdmin: true };

function makeCreateDto(over: Partial<CreateItemDto> = {}): CreateItemDto {
  return {
    name: 'Cloak of Whispers',
    category: 'Wondrous Item',
    rarity: 'Rare',
    requiresAttunement: true,
    isMagic: true,
    ...over,
  } as CreateItemDto;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('HomebrewItemsService', () => {
  let service: HomebrewItemsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewItemsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewItemsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('create', () => {
    it('creates a homebrew item owned by the actor with source "Homebrew"', async () => {
      const created = { id: 'i1', name: 'Cloak of Whispers' };
      prisma.item.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), OWNER);

      expect(prisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Cloak of Whispers',
          contentSource: 'homebrew',
          createdById: 'owner-1',
          source: 'Homebrew',
        }),
      });
      expect(result).toEqual(created);
    });

    it('maps a duplicate-name P2002 to ConflictException with homebrew copy', async () => {
      prisma.item.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(
        'You already have an item with this name'
      );
    });
  });

  describe('update', () => {
    const homebrewRow = { id: 'i1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('updates the owner’s own homebrew item', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      const updated = { ...homebrewRow, name: 'Greater Cloak' };
      prisma.item.update.mockResolvedValue(updated);

      const result = await service.update('i1', { name: 'Greater Cloak' }, OWNER);

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: expect.objectContaining({ name: 'Greater Cloak' }),
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFound when the item does not exist', async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
      expect(prisma.item.update).not.toHaveBeenCalled();
    });

    it('throws NotFound (not Forbidden) for someone else’s homebrew — invisible rows must not leak existence', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('i1', { name: 'X' }, STRANGER)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.item.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows (visible but immutable)', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins from editing shared rows but allows admins', async () => {
      const sharedRow = { id: 'sh1', contentSource: 'shared', createdById: 'someone' };
      prisma.item.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('sh1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);

      prisma.item.update.mockResolvedValue({ ...sharedRow, name: 'X' });
      await expect(service.update('sh1', { name: 'X' }, ADMIN)).resolves.toEqual(
        expect.objectContaining({ name: 'X' })
      );
    });

    it('never lets an update change ownership or tier fields', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.update.mockResolvedValue(homebrewRow);

      await service.update(
        'i1',
        { name: 'X', contentSource: 'shared', createdById: 'evil' } as never,
        OWNER
      );

      const data = prisma.item.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it.each(['stealthDisadvantage', 'requiresAttunement', 'isMagic'])(
      'coerces null %s to false — the column is non-nullable',
      async field => {
        prisma.item.findUnique.mockResolvedValue(homebrewRow);
        prisma.item.update.mockResolvedValue(homebrewRow);

        await service.update('i1', { [field]: null } as never, OWNER);

        const data = prisma.item.update.mock.calls[0][0].data;
        expect(data[field]).toBe(false);
      }
    );

    it('coerces null properties to an empty array — the column is non-nullable', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.update.mockResolvedValue(homebrewRow);

      await service.update('i1', { properties: null } as never, OWNER);

      const data = prisma.item.update.mock.calls[0][0].data;
      expect(data.properties).toEqual([]);
    });

    it('normalizes empty-string rarity to null so the rarity filter cannot mis-bucket it', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.update.mockResolvedValue(homebrewRow);

      await service.update('i1', { rarity: '   ' } as never, OWNER);

      const data = prisma.item.update.mock.calls[0][0].data;
      expect(data.rarity).toBeNull();
    });

    it('maps a concurrent-delete P2025 on update to NotFound (not 500)', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.update('i1', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
    });

    it('uses tier-aware conflict copy for shared-content collisions', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'sh1',
        contentSource: 'shared',
        createdById: 'someone',
      });
      prisma.item.update.mockRejectedValue(p2002());

      await expect(service.update('sh1', { name: 'Dup' }, ADMIN)).rejects.toThrow(
        'A shared item with this name already exists'
      );
    });

    it('maps a duplicate-name P2002 on update to ConflictException', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.update.mockRejectedValue(p2002());

      await expect(service.update('i1', { name: 'Dup' }, OWNER)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    const homebrewRow = { id: 'i1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('deletes the owner’s own homebrew item', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.delete.mockResolvedValue(homebrewRow);

      await service.remove('i1', OWNER);

      expect(prisma.item.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('throws NotFound when the item does not exist', async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', OWNER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for someone else’s homebrew', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.remove('i1', STRANGER)).rejects.toThrow(NotFoundException);
      expect(prisma.item.delete).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('maps a concurrent-delete P2025 to NotFound (not 500)', async () => {
      prisma.item.findUnique.mockResolvedValue(homebrewRow);
      prisma.item.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.remove('i1', OWNER)).rejects.toThrow(NotFoundException);
    });
  });
});
