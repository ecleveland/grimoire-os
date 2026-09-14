import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateBackgroundDto } from './dto/create-background.dto';

const OWNER = { userId: 'owner-1', isAdmin: false };

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
  });

  describe('update', () => {
    const homebrewRow = {
      id: 'bg1',
      contentSource: 'homebrew',
      createdById: 'owner-1',
      originFeatId: null,
    };

    it('authorizes before validating, so a stranger gets 404 rather than a validation 400', async () => {
      prisma.background.findUnique.mockResolvedValue(homebrewRow);

      // toColumnData rejects a null name with 400, so this payload would fail
      // validation if it were ever mapped. It must not be: the row belongs to
      // someone else, and running validation first would answer a stranger with
      // a 400 that confirms their payload was processed, where an unreadable row
      // must be indistinguishable from a nonexistent one. Ordering in
      // ContentCrudService.update (load-and-authorize, then map columns) is what
      // guarantees this, and nothing else in the suite pins it.
      await expect(
        service.update('bg1', { name: null } as never, { userId: 'stranger-1', isAdmin: false })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.background.update).not.toHaveBeenCalled();
    });

    it('authorizes before validating for SRD rows too, so the answer is 403 not 400', async () => {
      prisma.background.findUnique.mockResolvedValue({
        id: 'srd1',
        contentSource: 'srd',
        createdById: null,
        originFeatId: null,
      });

      // Sibling of the case above on the visible-but-immutable path: the row is
      // readable, so the honest answer is "you may not write this", not a
      // complaint about a payload that was never going to be applied.
      await expect(service.update('srd1', { name: null } as never, OWNER)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.background.update).not.toHaveBeenCalled();
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
  });
});
