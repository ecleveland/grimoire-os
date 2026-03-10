import { Test, TestingModule } from '@nestjs/testing';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockPrismaService,
  prismaMockProvider,
} from '../test/prisma-mock.factory';

describe('SeedService', () => {
  let service: SeedService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeedService, prismaMockProvider()],
    }).compile();

    service = module.get<SeedService>(SeedService);
    prisma = module.get<MockPrismaService>(PrismaService as any);

    // Silence console.log during tests
    jest.spyOn(console, 'log').mockImplementation();

    // All upserts resolve successfully
    prisma.spell.upsert.mockResolvedValue({});
    prisma.monster.upsert.mockResolvedValue({});
    prisma.item.upsert.mockResolvedValue({});
    prisma.srdClass.upsert.mockResolvedValue({});
    prisma.race.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('calls upsert the correct number of times (5+5+5+12+9 = 36)', async () => {
    await service.seed();

    expect(prisma.spell.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.monster.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.item.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.srdClass.upsert).toHaveBeenCalledTimes(12);
    expect(prisma.race.upsert).toHaveBeenCalledTimes(9);
  });

  it('uses { name } as the where clause for each upsert', async () => {
    await service.seed();

    // Verify spell upserts use name as where
    for (const call of prisma.spell.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('name');
      expect(call[0].create).toHaveProperty('name');
      expect(call[0].update).toHaveProperty('name');
    }

    // Verify monster upserts use name as where
    for (const call of prisma.monster.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('name');
    }

    // Verify item upserts use name as where
    for (const call of prisma.item.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('name');
    }

    // Verify class upserts use name as where
    for (const call of prisma.srdClass.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('name');
    }

    // Verify race upserts use name as where
    for (const call of prisma.race.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('name');
    }
  });
});
