import { Test, TestingModule } from '@nestjs/testing';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockPrismaService,
  prismaMockProvider,
} from '../test/prisma-mock.factory';

// Mock the API fetcher module
jest.mock('./srd-api.fetcher', () => ({
  fetchAllDetails: jest.fn(),
}));

import { fetchAllDetails } from './srd-api.fetcher';

const mockFetchAllDetails = fetchAllDetails as jest.MockedFunction<typeof fetchAllDetails>;

describe('SeedService', () => {
  let service: SeedService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeedService, prismaMockProvider()],
    }).compile();

    service = module.get<SeedService>(SeedService);
    prisma = module.get<MockPrismaService>(PrismaService as any);

    // Silence console output during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    // All createMany resolve successfully
    prisma.spell.createMany.mockResolvedValue({ count: 0 });
    prisma.monster.createMany.mockResolvedValue({ count: 0 });
    prisma.item.createMany.mockResolvedValue({ count: 0 });
    prisma.srdClass.createMany.mockResolvedValue({ count: 0 });
    prisma.race.createMany.mockResolvedValue({ count: 0 });
    prisma.background.createMany.mockResolvedValue({ count: 0 });
    prisma.feat.createMany.mockResolvedValue({ count: 0 });
    prisma.condition.createMany.mockResolvedValue({ count: 0 });
    prisma.skill.createMany.mockResolvedValue({ count: 0 });
    prisma.language.createMany.mockResolvedValue({ count: 0 });

    // Subclass/subrace FK resolution
    prisma.srdClass.findUnique.mockResolvedValue({ id: 'class-1', name: 'Fighter' });
    prisma.race.findUnique.mockResolvedValue({ id: 'race-1', name: 'Dwarf' });
    prisma.subclass.upsert.mockResolvedValue({});
    prisma.subrace.upsert.mockResolvedValue({});

    // $transaction executes the callback
    prisma.$transaction.mockImplementation((fn) => fn(prisma));

    // Default: API returns sample data
    mockFetchAllDetails.mockImplementation((endpoint: string) => {
      const mockData: Record<string, unknown[]> = {
        spells: [{ name: 'Test Spell', level: 0, school: { name: 'Evocation' }, casting_time: '1 action', range: '60 feet', components: ['V', 'S'], duration: 'Instantaneous', concentration: false, ritual: false, desc: ['A test spell.'], classes: [{ name: 'Wizard' }] }],
        monsters: [{ name: 'Test Monster', size: 'Medium', type: 'beast', alignment: 'unaligned', armor_class: [{ value: 12 }], hit_points: 10, hit_dice: '2d8', speed: { walk: '30 ft.' }, strength: 10, dexterity: 10, constitution: 10, intelligence: 2, wisdom: 10, charisma: 5, proficiencies: [], damage_resistances: [], damage_immunities: [], damage_vulnerabilities: [], condition_immunities: [], senses: {}, languages: '', challenge_rating: 0.25, xp: 50, actions: [] }],
        equipment: [{ name: 'Test Sword', equipment_category: { name: 'Weapon' }, category_range: 'Martial Melee', cost: { quantity: 15, unit: 'gp' }, weight: 3, properties: [] }],
        'magic-items': [{ name: 'Test Wand', equipment_category: { name: 'Wondrous Items' }, rarity: { name: 'Uncommon' }, desc: ['A magical wand.'] }],
        backgrounds: [{ name: 'Test Background', starting_proficiencies: [], feature: { name: 'Test Feature', desc: ['A feature.'] }, personality_traits: { from: { options: [] } }, ideals: { from: { options: [] } }, bonds: { from: { options: [] } }, flaws: { from: { options: [] } }, starting_equipment: [] }],
        feats: [{ name: 'Test Feat', desc: ['A test feat.', 'Benefit 1.'], prerequisites: [] }],
      };
      return Promise.resolve(mockData[endpoint] ?? []);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fetches from API and calls createMany for all tables', async () => {
    await service.seed();

    expect(mockFetchAllDetails).toHaveBeenCalledWith('spells');
    expect(mockFetchAllDetails).toHaveBeenCalledWith('monsters');
    expect(mockFetchAllDetails).toHaveBeenCalledWith('equipment');
    expect(mockFetchAllDetails).toHaveBeenCalledWith('magic-items');
    expect(mockFetchAllDetails).toHaveBeenCalledWith('backgrounds');
    expect(mockFetchAllDetails).toHaveBeenCalledWith('feats');
    expect(prisma.spell.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.monster.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.item.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.condition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.skill.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.language.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.srdClass.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.race.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('merges equipment and magic items into a single items insert', async () => {
    await service.seed();

    const itemsCall = prisma.item.createMany.mock.calls[0][0];
    expect(itemsCall.data).toHaveLength(2); // 1 equipment + 1 magic item
    expect(itemsCall.data[0].name).toBe('Test Sword');
    expect(itemsCall.data[1].name).toBe('Test Wand');
    expect(itemsCall.data[1].isMagic).toBe(true);
  });

  it('falls back to static data when API fails', async () => {
    mockFetchAllDetails.mockRejectedValue(new Error('Network error'));

    await service.seed();

    // Should still call createMany with fallback data
    expect(prisma.spell.createMany).toHaveBeenCalled();
    expect(prisma.monster.createMany).toHaveBeenCalled();
    expect(prisma.item.createMany).toHaveBeenCalled();
  });

  it('uses static data when SEED_FROM_API=false', async () => {
    process.env.SEED_FROM_API = 'false';
    mockFetchAllDetails.mockClear();

    await service.seed();

    expect(mockFetchAllDetails).not.toHaveBeenCalled();
    expect(prisma.spell.createMany).toHaveBeenCalled();

    delete process.env.SEED_FROM_API;
  });

  it('resolves FK references for subclasses via upsert', async () => {
    await service.seed();

    expect(prisma.srdClass.findUnique).toHaveBeenCalled();
    expect(prisma.subclass.upsert).toHaveBeenCalled();
  });

  it('resolves FK references for subraces via upsert', async () => {
    await service.seed();

    expect(prisma.race.findUnique).toHaveBeenCalled();
    expect(prisma.subrace.upsert).toHaveBeenCalled();
  });

  it('wraps everything in a transaction', async () => {
    await service.seed();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
