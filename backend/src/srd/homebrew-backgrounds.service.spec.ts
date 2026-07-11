import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateBackgroundDto } from './dto/create-background.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };
const STRANGER = { userId: 'stranger-1', isAdmin: false };
const ADMIN = { userId: 'admin-1', isAdmin: true };

const SRD_FEAT = { id: 'feat-srd', contentSource: 'srd', createdById: null };
const OWN_HOMEBREW_FEAT = { id: 'feat-own', contentSource: 'homebrew', createdById: 'owner-1' };

function makeCreateDto(over: Partial<CreateBackgroundDto> = {}): CreateBackgroundDto {
  return {
    name: 'Gravedigger',
    description: 'You spent years tending the resting places of the dead.',
    skillProficiencies: ['Insight', 'Religion'],
    ...over,
  } as CreateBackgroundDto;
}

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

describe('HomebrewBackgroundsService', () => {
  let service: HomebrewBackgroundsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewBackgroundsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewBackgroundsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  describe('create', () => {
    it('creates a homebrew background owned by the actor with source "Homebrew"', async () => {
      const created = { id: 'bg1', name: 'Gravedigger' };
      prisma.background.create.mockResolvedValue(created);

      const result = await service.create(makeCreateDto(), OWNER);

      expect(prisma.background.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Gravedigger',
          contentSource: 'homebrew',
          createdById: 'owner-1',
          source: 'Homebrew',
        }),
      });
      expect(result).toEqual(created);
    });

    it('accepts an SRD origin feat', async () => {
      prisma.feat.findFirst.mockResolvedValue(SRD_FEAT);
      prisma.background.create.mockResolvedValue({ id: 'bg1' });

      await service.create(makeCreateDto({ originFeatId: 'feat-srd' }), OWNER);

      expect(prisma.feat.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'feat-srd' }),
      });
      expect(prisma.background.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ originFeatId: 'feat-srd' }),
      });
    });

    it("accepts the actor's own homebrew origin feat", async () => {
      prisma.feat.findFirst.mockResolvedValue(OWN_HOMEBREW_FEAT);
      prisma.background.create.mockResolvedValue({ id: 'bg1' });

      await service.create(makeCreateDto({ originFeatId: 'feat-own' }), OWNER);

      // The lookup must be visibility-scoped to the actor, not a bare findUnique:
      // that is what makes another owner's homebrew feat unresolvable.
      const where = prisma.feat.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { contentSource: { in: ['srd', 'shared'] } },
        { createdById: 'owner-1' },
      ]);
    });

    it("rejects another user's homebrew feat as origin with 400 (no existence leak)", async () => {
      // Visibility-scoped lookup resolves nothing for a foreign homebrew feat.
      prisma.feat.findFirst.mockResolvedValue(null);

      await expect(
        service.create(makeCreateDto({ originFeatId: 'feat-foreign' }), OWNER)
      ).rejects.toThrow(BadRequestException);
      expect(prisma.background.create).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent origin feat with 400', async () => {
      prisma.feat.findFirst.mockResolvedValue(null);

      await expect(
        service.create(makeCreateDto({ originFeatId: 'feat-nope' }), OWNER)
      ).rejects.toThrow('Origin feat not found or not accessible');
    });

    it('drops an originFeatOption supplied without an originFeatId', async () => {
      prisma.background.create.mockResolvedValue({ id: 'bg1' });

      await service.create(makeCreateDto({ originFeatOption: 'Cleric' }), OWNER);

      const data = prisma.background.create.mock.calls[0][0].data;
      expect(data.originFeatOption).toBeNull();
      expect(prisma.feat.findFirst).not.toHaveBeenCalled();
    });

    it('maps a duplicate-name P2002 to ConflictException with homebrew copy', async () => {
      prisma.background.create.mockRejectedValue(p2002());

      await expect(service.create(makeCreateDto(), OWNER)).rejects.toThrow(
        'You already have a background with this name'
      );
    });
  });

  describe('update', () => {
    const homebrewRow = {
      id: 'bg1',
      contentSource: 'homebrew',
      createdById: 'owner-1',
      originFeatId: null,
    };

    it("updates the owner's own homebrew background", async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      const updated = { ...homebrewRow, name: 'Exhumed Gravedigger' };
      prisma.background.update.mockResolvedValue(updated);

      const result = await service.update('bg1', { name: 'Exhumed Gravedigger' }, OWNER);

      expect(prisma.background.update).toHaveBeenCalledWith({
        where: { id: 'bg1' },
        data: expect.objectContaining({ name: 'Exhumed Gravedigger' }),
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFound when the background does not exist', async () => {
      prisma.background.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
      expect(prisma.background.update).not.toHaveBeenCalled();
    });

    it("throws NotFound (not Forbidden) for someone else's homebrew — invisible rows must not leak existence", async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('bg1', { name: 'X' }, STRANGER)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.background.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows (visible but immutable — SRD is never modified)', async () => {
      prisma.background.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.update('s1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('forbids non-admins from editing shared rows but allows admins', async () => {
      const sharedRow = { id: 'sh1', contentSource: 'shared', createdById: 'someone' };
      prisma.background.findUnique.mockResolvedValue(sharedRow);

      await expect(service.update('sh1', { name: 'X' }, OWNER)).rejects.toThrow(ForbiddenException);

      prisma.background.update.mockResolvedValue({ ...sharedRow, name: 'X' });
      await expect(service.update('sh1', { name: 'X' }, ADMIN)).resolves.toEqual(
        expect.objectContaining({ name: 'X' })
      );
    });

    it('never lets an update change ownership or tier fields', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update(
        'bg1',
        { name: 'X', contentSource: 'shared', createdById: 'evil' } as never,
        OWNER
      );

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('contentSource');
      expect(data).not.toHaveProperty('createdById');
    });

    it('re-validates origin-feat visibility on update', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.findFirst.mockResolvedValue(null);

      await expect(service.update('bg1', { originFeatId: 'feat-foreign' }, OWNER)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.background.update).not.toHaveBeenCalled();
    });

    it('clearing originFeatId to null also clears originFeatOption', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update('bg1', { originFeatId: null } as never, OWNER);

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.originFeatId).toBeNull();
      expect(data.originFeatOption).toBeNull();
      expect(prisma.feat.findFirst).not.toHaveBeenCalled();
    });

    it('drops an option-only PATCH when the background has no linked feat (no orphan option)', async () => {
      prisma.background.findUnique.mockResolvedValue({ ...homebrewRow, originFeatId: null });
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update('bg1', { originFeatOption: 'Cleric' } as never, OWNER);

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.originFeatOption).toBeNull();
    });

    it('clears the option when retargeting to a different feat without resending it', async () => {
      // A stale option belongs to the OLD feat; carrying it onto the new one
      // would render e.g. "Alert (Cleric)" — an option that was never chosen
      // for Alert.
      prisma.background.findUnique.mockResolvedValue({ ...homebrewRow, originFeatId: 'feat-old' });
      prisma.feat.findFirst.mockResolvedValue(SRD_FEAT);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update('bg1', { originFeatId: 'feat-srd' } as never, OWNER);

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.originFeatId).toBe('feat-srd');
      expect(data.originFeatOption).toBeNull();
    });

    it('keeps an explicitly-sent option when retargeting the feat', async () => {
      prisma.background.findUnique.mockResolvedValue({ ...homebrewRow, originFeatId: 'feat-old' });
      prisma.feat.findFirst.mockResolvedValue(SRD_FEAT);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update(
        'bg1',
        { originFeatId: 'feat-srd', originFeatOption: 'Wizard' } as never,
        OWNER
      );

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.originFeatOption).toBe('Wizard');
    });

    it('allows an option-only PATCH to retarget the option of an already-linked feat', async () => {
      prisma.background.findUnique.mockResolvedValue({ ...homebrewRow, originFeatId: 'feat-srd' });
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update('bg1', { originFeatOption: 'Wizard' } as never, OWNER);

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.originFeatOption).toBe('Wizard');
    });

    it('rejects clearing name to null with 400 — the column is non-nullable and required', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.update('bg1', { name: null } as never, OWNER)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.background.update).not.toHaveBeenCalled();
    });

    it('leaves the origin feat untouched when the key is absent', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update('bg1', { name: 'X' }, OWNER);

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('originFeatId');
      expect(data).not.toHaveProperty('originFeatOption');
    });

    it('coerces null languages to 0 and null arrays to [] — the columns are non-nullable', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update(
        'bg1',
        { languages: null, skillProficiencies: null, ideals: null } as never,
        OWNER
      );

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.languages).toBe(0);
      expect(data.skillProficiencies).toEqual([]);
      expect(data.ideals).toEqual([]);
    });

    it('normalizes blank equipment/description/originFeatOption strings to null', async () => {
      prisma.background.findUnique.mockResolvedValue({ ...homebrewRow, originFeatId: 'feat-srd' });
      prisma.background.update.mockResolvedValue(homebrewRow);

      await service.update(
        'bg1',
        { equipment: '   ', description: '', originFeatOption: ' ' } as never,
        OWNER
      );

      const data = prisma.background.update.mock.calls[0][0].data;
      expect(data.equipment).toBeNull();
      expect(data.description).toBeNull();
      expect(data.originFeatOption).toBeNull();
    });

    it('maps a concurrent-delete P2025 on update to NotFound (not 500)', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockRejectedValue(p2025());

      await expect(service.update('bg1', { name: 'X' }, OWNER)).rejects.toThrow(NotFoundException);
    });

    it('uses tier-aware conflict copy for shared-content collisions', async () => {
      prisma.background.findUnique.mockResolvedValue({
        id: 'sh1',
        contentSource: 'shared',
        createdById: 'someone',
      });
      prisma.background.update.mockRejectedValue(p2002());

      await expect(service.update('sh1', { name: 'Dup' }, ADMIN)).rejects.toThrow(
        'A shared background with this name already exists'
      );
    });

    it('maps a duplicate-name P2002 on update to ConflictException', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.update.mockRejectedValue(p2002());

      await expect(service.update('bg1', { name: 'Dup' }, OWNER)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    const homebrewRow = { id: 'bg1', contentSource: 'homebrew', createdById: 'owner-1' };

    it("deletes the owner's own homebrew background", async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.delete.mockResolvedValue(homebrewRow);

      await service.remove('bg1', OWNER);

      expect(prisma.background.delete).toHaveBeenCalledWith({ where: { id: 'bg1' } });
    });

    it('throws NotFound when the background does not exist', async () => {
      prisma.background.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', OWNER)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFound for someone else's homebrew", async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);

      await expect(service.remove('bg1', STRANGER)).rejects.toThrow(NotFoundException);
      expect(prisma.background.delete).not.toHaveBeenCalled();
    });

    it('throws Forbidden for SRD rows', async () => {
      prisma.background.findUnique.mockResolvedValue({
        id: 's1',
        contentSource: 'srd',
        createdById: null,
      });

      await expect(service.remove('s1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('maps a concurrent-delete P2025 to NotFound (not 500)', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);
      prisma.background.delete.mockRejectedValue(p2025());

      await expect(service.remove('bg1', OWNER)).rejects.toThrow(NotFoundException);
    });
  });
});
