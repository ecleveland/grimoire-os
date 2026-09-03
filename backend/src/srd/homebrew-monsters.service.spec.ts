import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { CreateMonsterDto } from './dto/create-monster.dto';

/**
 * Monster-specific write behavior only. The authorization skeleton is asserted
 * for every tiered service in `content-write.contract.spec.ts`.
 */

const OWNER = { userId: 'owner-1', isAdmin: false };

function makeCreateDto(over: Partial<CreateMonsterDto> = {}): CreateMonsterDto {
  return {
    name: 'Dire Badger',
    size: 'Medium',
    type: 'beast',
    ...over,
  } as CreateMonsterDto;
}

describe('HomebrewMonstersService', () => {
  let service: HomebrewMonstersService;
  let prisma: MockPrismaService;
  const homebrewRow = { id: 'm1', contentSource: 'homebrew', createdById: 'owner-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HomebrewMonstersService, ContentAccessService, prismaMockProvider()],
    }).compile();

    service = module.get(HomebrewMonstersService);
    prisma = module.get<MockPrismaService>(PrismaService as never);
  });

  describe('the non-null actions guarantee (the read-side type requires an array)', () => {
    it('defaults actions to an empty array when omitted', async () => {
      prisma.monster.create.mockResolvedValue({ id: 'm1' });

      await service.create(makeCreateDto(), OWNER);

      expect(prisma.monster.create.mock.calls[0][0].data.actions).toEqual([]);
    });

    it('passes through actions when provided', async () => {
      prisma.monster.create.mockResolvedValue({ id: 'm1' });
      const actions = [{ name: 'Bite', description: 'Gnaw.' }];

      await service.create(makeCreateDto({ actions } as Partial<CreateMonsterDto>), OWNER);

      expect(prisma.monster.create.mock.calls[0][0].data.actions).toEqual(actions);
    });

    it('coerces a null actions update to []', async () => {
      prisma.monster.findUnique.mockResolvedValue(homebrewRow);
      prisma.monster.update.mockResolvedValue(homebrewRow);

      await service.update('m1', { actions: null } as never, OWNER);

      expect(prisma.monster.update.mock.calls[0][0].data.actions).toEqual([]);
    });
  });

  it('maps null Json fields to Prisma.DbNull so clearing them actually persists', async () => {
    prisma.monster.findUnique.mockResolvedValue(homebrewRow);
    prisma.monster.update.mockResolvedValue(homebrewRow);

    await service.update('m1', { savingThrows: null, skills: null } as never, OWNER);

    const data = prisma.monster.update.mock.calls[0][0].data;
    expect(data.savingThrows).toBe(Prisma.DbNull);
    expect(data.skills).toBe(Prisma.DbNull);
  });
});
