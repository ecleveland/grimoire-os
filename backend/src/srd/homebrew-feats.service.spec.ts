import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewFeatsService } from './homebrew-feats.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateFeatDto } from './dto/create-feat.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };
const STRANGER = { userId: 'stranger-1', isAdmin: false };
const ADMIN = { userId: 'admin-1', isAdmin: true };

function makeCreateDto(over: Partial<CreateFeatDto> = {}): CreateFeatDto {
  return {
    name: 'Shield Master',
    description: 'You use shields not just for protection but also for offense.',
    category: 'General',
    ...over,
  } as CreateFeatDto;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('HomebrewFeatsService', () => {
  let service: HomebrewFeatsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewFeatsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewFeatsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('create', () => {
    it('creates a homebrew feat owned by the actor with source "Homebrew"', async () => {
      const created = { id: 'f1', name: 'Shield Master' };
      prisma.feat.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), OWNER);

      expect(prisma.feat.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Shield Master',
          contentSource: 'homebrew',
          createdById: 'owner-1',
          source: 'Homebrew',
        }),
      });
      expect(result).toEqual(created);
    });

    it('maps a duplicate-name P2002 to ConflictException with homebrew copy', async () => {
      prisma.feat.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(
        'You already have a feat with this name'
      );
    });
  });

  describe('update', () => {
    const homebrewRow = { id: 'f1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('updates the owner’s own homebrew feat', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      const updated = { ...homebrewRow, name: 'Greater Shield Master' };
      prisma.feat.update.mockResolvedValue(updated);

      const result = await service.update('f1', { name: 'Greater Shield Master' }, OWNER);

      expect(prisma.feat.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: expect.objectContaining({ name: 'Greater Shield Master' }),
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFound when the feat does not exist', async () => {
      prisma.feat.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
      expect(prisma.feat.update).not.toHaveBeenCalled();
    });

    it('throws NotFound (not Forbidden) for someone else’s homebrew — invisible rows must not leak existence', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('f1', { name: 'X' }, STRANGER)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.feat.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows (visible but immutable)', async () => {
      prisma.feat.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins from editing shared rows but allows admins', async () => {
      const sharedRow = { id: 'sh1', contentSource: 'shared', createdById: 'someone' };
      prisma.feat.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('sh1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);

      prisma.feat.update.mockResolvedValue({ ...sharedRow, name: 'X' });
      await expect(service.update('sh1', { name: 'X' }, ADMIN)).resolves.toEqual(
        expect.objectContaining({ name: 'X' })
      );
    });

    it('never lets an update change ownership or tier fields', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockResolvedValue(homebrewRow);

      await service.update(
        'f1',
        { name: 'X', contentSource: 'shared', createdById: 'evil' } as never,
        OWNER
      );

      const data = prisma.feat.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it('coerces null repeatable to false — the column is non-nullable', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockResolvedValue(homebrewRow);

      await service.update('f1', { repeatable: null } as never, OWNER);

      const data = prisma.feat.update.mock.calls[0][0].data;
      expect(data.repeatable).toBe(false);
    });

    it('normalizes empty-string prerequisite and category to null so the hasPrerequisite filter cannot mis-bucket them', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockResolvedValue(homebrewRow);

      await service.update('f1', { prerequisite: '   ', category: '' } as never, OWNER);

      const data = prisma.feat.update.mock.calls[0][0].data;
      expect(data.prerequisite).toBeNull();
      expect(data.category).toBeNull();
    });

    it('maps null benefits to a DB NULL — Prisma rejects plain null on Json columns', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockResolvedValue(homebrewRow);

      await service.update('f1', { benefits: null } as never, OWNER);

      const data = prisma.feat.update.mock.calls[0][0].data;
      expect(data.benefits).toBe(Prisma.DbNull);
    });

    it('maps a concurrent-delete P2025 on update to NotFound (not 500)', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.update('f1', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
    });

    it('uses tier-aware conflict copy for shared-content collisions', async () => {
      prisma.feat.findUnique.mockResolvedValue({
        id: 'sh1',
        contentSource: 'shared',
        createdById: 'someone',
      });
      prisma.feat.update.mockRejectedValue(p2002());

      await expect(service.update('sh1', { name: 'Dup' }, ADMIN)).rejects.toThrow(
        'A shared feat with this name already exists'
      );
    });

    it('maps a duplicate-name P2002 on update to ConflictException', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockRejectedValue(p2002());

      await expect(service.update('f1', { name: 'Dup' }, OWNER)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    const homebrewRow = { id: 'f1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('deletes the owner’s own homebrew feat', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.delete.mockResolvedValue(homebrewRow);

      await service.remove('f1', OWNER);

      expect(prisma.feat.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('throws NotFound when the feat does not exist', async () => {
      prisma.feat.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', OWNER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for someone else’s homebrew', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.remove('f1', STRANGER)).rejects.toThrow(NotFoundException);
      expect(prisma.feat.delete).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows', async () => {
      prisma.feat.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('maps a concurrent-delete P2025 to NotFound (not 500)', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.remove('f1', OWNER)).rejects.toThrow(NotFoundException);
    });
  });
});
