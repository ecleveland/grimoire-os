import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewSpellsService } from './homebrew-spells.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateSpellDto } from './dto/create-spell.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };
const STRANGER = { userId: 'stranger-1', isAdmin: false };
const ADMIN = { userId: 'admin-1', isAdmin: true };

function makeCreateDto(over: Partial<CreateSpellDto> = {}): CreateSpellDto {
  return {
    name: 'Arcane Burst',
    level: 2,
    school: 'Evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A burst of raw arcane energy.',
    classes: ['Wizard'],
    ...over,
  } as CreateSpellDto;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('HomebrewSpellsService', () => {
  let service: HomebrewSpellsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewSpellsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewSpellsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('create', () => {
    it('creates a homebrew spell owned by the actor with source "Homebrew"', async () => {
      const created = { id: 'sp1', name: 'Arcane Burst' };
      prisma.spell.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), OWNER);

      expect(prisma.spell.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Arcane Burst',
          contentSource: 'homebrew',
          createdById: 'owner-1',
          source: 'Homebrew',
        }),
      });
      expect(result).toEqual(created);
    });

    it('maps a duplicate-name P2002 to ConflictException with homebrew copy', async () => {
      prisma.spell.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(
        'You already have a spell with this name'
      );
    });
  });

  describe('update', () => {
    const homebrewRow = { id: 'sp1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('updates the owner’s own homebrew spell', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      const updated = { ...homebrewRow, name: 'Greater Arcane Burst' };
      prisma.spell.update.mockResolvedValue(updated);

      const result = await service.update('sp1', { name: 'Greater Arcane Burst' }, OWNER);

      expect(prisma.spell.update).toHaveBeenCalledWith({
        where: { id: 'sp1' },
        data: expect.objectContaining({ name: 'Greater Arcane Burst' }),
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFound when the spell does not exist', async () => {
      prisma.spell.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
      expect(prisma.spell.update).not.toHaveBeenCalled();
    });

    it('throws NotFound (not Forbidden) for someone else’s homebrew — invisible rows must not leak existence', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('sp1', { name: 'X' }, STRANGER)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.spell.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows (visible but immutable)', async () => {
      prisma.spell.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins from editing shared rows but allows admins', async () => {
      const sharedRow = { id: 'sh1', contentSource: 'shared', createdById: 'someone' };
      prisma.spell.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('sh1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);

      prisma.spell.update.mockResolvedValue({ ...sharedRow, name: 'X' });
      await expect(service.update('sh1', { name: 'X' }, ADMIN)).resolves.toEqual(
        expect.objectContaining({ name: 'X' })
      );
    });

    it('never lets an update change ownership or tier fields', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.update.mockResolvedValue(homebrewRow);

      await service.update(
        'sp1',
        { name: 'X', contentSource: 'shared', createdById: 'evil' } as never,
        OWNER
      );

      const data = prisma.spell.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it('coerces null classes/ritual/concentration to their non-null defaults — the columns are non-nullable', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.update.mockResolvedValue(homebrewRow);

      await service.update(
        'sp1',
        { classes: null, ritual: null, concentration: null } as never,
        OWNER
      );

      const data = prisma.spell.update.mock.calls[0][0].data;
      expect(data.classes).toEqual([]);
      expect(data.ritual).toBe(false);
      expect(data.concentration).toBe(false);
    });

    it('maps a concurrent-delete P2025 on update to NotFound (not 500)', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.update('sp1', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
    });

    it('uses tier-aware conflict copy for shared-content collisions', async () => {
      prisma.spell.findUnique.mockResolvedValue({
        id: 'sh1',
        contentSource: 'shared',
        createdById: 'someone',
      });
      prisma.spell.update.mockRejectedValue(p2002());

      await expect(service.update('sh1', { name: 'Dup' }, ADMIN)).rejects.toThrow(
        'A shared spell with this name already exists'
      );
    });

    it('maps a duplicate-name P2002 on update to ConflictException', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.update.mockRejectedValue(p2002());

      await expect(service.update('sp1', { name: 'Dup' }, OWNER)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    const homebrewRow = { id: 'sp1', contentSource: 'homebrew', createdById: 'owner-1' };

    it('deletes the owner’s own homebrew spell', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.delete.mockResolvedValue(homebrewRow);

      await service.remove('sp1', OWNER);

      expect(prisma.spell.delete).toHaveBeenCalledWith({ where: { id: 'sp1' } });
    });

    it('throws NotFound when the spell does not exist', async () => {
      prisma.spell.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', OWNER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for someone else’s homebrew', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.remove('sp1', STRANGER)).rejects.toThrow(NotFoundException);
      expect(prisma.spell.delete).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows', async () => {
      prisma.spell.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('maps a concurrent-delete P2025 to NotFound (not 500)', async () => {
      prisma.spell.findUnique.mockResolvedValue(homebrewRow);
      prisma.spell.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        })
      );

      await expect(service.remove('sp1', OWNER)).rejects.toThrow(NotFoundException);
    });
  });
});
