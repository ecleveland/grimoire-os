import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { HomebrewFeatsService } from './homebrew-feats.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateFeatDto } from './dto/create-feat.dto';

/**
 * Feat-specific write behavior only. The authorization skeleton is asserted for
 * every tiered service in `content-write.contract.spec.ts`; what stays here is
 * the column normalization and the referential cleanup a feat delete performs.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateFeatDto> = {}): CreateFeatDto {
  return {
    name: 'Shield Master',
    description: 'You use shields not just for protection but also for offense.',
    category: 'General',
    ...over,
  } as CreateFeatDto;
}

describe('HomebrewFeatsService', () => {
  let service: HomebrewFeatsService;
  let prisma: MockPrismaService;
  const homebrewRow = { id: 'f1', contentSource: 'homebrew', createdById: 'owner-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewFeatsService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewFeatsService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
  });

  it('passes feat columns through to the create', async () => {
    prisma.feat.create.mockResolvedValue({ id: 'f1' });

    await service.create(makeCreateDto(), OWNER);

    expect(prisma.feat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Shield Master', category: 'General' }),
    });
  });

  describe('column normalization', () => {
    beforeEach(() => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.update.mockResolvedValue(homebrewRow);
    });

    it('coerces null repeatable to false — the column is non-nullable', async () => {
      await service.update('f1', { repeatable: null } as never, OWNER);

      expect(prisma.feat.update.mock.calls[0][0].data.repeatable).toBe(false);
    });

    it('normalizes empty-string prerequisite and category to null so the hasPrerequisite filter cannot mis-bucket them', async () => {
      await service.update('f1', { prerequisite: '  ', category: '' } as never, OWNER);

      const data = prisma.feat.update.mock.calls[0][0].data;
      expect(data.prerequisite).toBeNull();
      expect(data.category).toBeNull();
    });

    it('maps null benefits to a DB NULL — Prisma rejects plain null on Json columns', async () => {
      await service.update('f1', { benefits: null } as never, OWNER);

      expect(prisma.feat.update.mock.calls[0][0].data.benefits).toBe(Prisma.DbNull);
    });
  });

  describe('remove', () => {
    it('clears originFeatOption on backgrounds that used the feat — SET NULL only nulls the id (VEG-431)', async () => {
      prisma.feat.findUnique.mockResolvedValue(homebrewRow);
      prisma.feat.delete.mockResolvedValue(homebrewRow);
      prisma.background.updateMany.mockResolvedValue({ count: 1 });

      await service.remove('f1', OWNER);

      expect(prisma.background.updateMany).toHaveBeenCalledWith({
        where: { originFeatId: 'f1' },
        data: { originFeatOption: null },
      });
      expect(prisma.feat.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
      // The option clear and the delete ride one transaction so a failed
      // delete can't leave the referencing backgrounds half-updated.
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
