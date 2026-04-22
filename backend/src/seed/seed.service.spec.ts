import { Test, TestingModule } from '@nestjs/testing';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';

// Mock the JSON loader module
jest.mock('./srd-json.loader', () => ({
  loadSpellsFromJson: jest.fn(),
  loadMonstersFromJson: jest.fn(),
  loadMagicItemsFromJson: jest.fn(),
  loadSpeciesAsRacesFromJson: jest.fn(),
}));

import {
  loadSpellsFromJson,
  loadMonstersFromJson,
  loadMagicItemsFromJson,
  loadSpeciesAsRacesFromJson,
} from './srd-json.loader';

const mockLoadSpells = loadSpellsFromJson as jest.MockedFunction<typeof loadSpellsFromJson>;
const mockLoadMonsters = loadMonstersFromJson as jest.MockedFunction<typeof loadMonstersFromJson>;
const mockLoadMagicItems = loadMagicItemsFromJson as jest.MockedFunction<
  typeof loadMagicItemsFromJson
>;
const mockLoadSpecies = loadSpeciesAsRacesFromJson as jest.MockedFunction<
  typeof loadSpeciesAsRacesFromJson
>;

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
    prisma.srdClass.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Fighter',
    });
    prisma.race.findUnique.mockResolvedValue({ id: 'race-1', name: 'Dwarf' });
    prisma.subclass.upsert.mockResolvedValue({});
    prisma.subrace.upsert.mockResolvedValue({});

    // Dev admin user lookup returns null (user doesn't exist yet)
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({});

    // $transaction executes the callback
    prisma.$transaction.mockImplementation(fn => fn(prisma));

    // Mock JSON loaders
    mockLoadSpells.mockReturnValue([
      {
        name: 'Test Spell',
        level: 0,
        school: 'Evocation',
        castingTime: '1 action',
        range: '60 feet',
        components: 'V, S',
        material: null,
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        description: 'A test spell.',
        higherLevels: null,
        classes: ['Wizard'],
      },
    ]);
    mockLoadMonsters.mockReturnValue([
      {
        name: 'Test Monster',
        size: 'Medium',
        type: 'Beast',
        subtype: null,
        alignment: 'Unaligned',
        armorClass: 12,
        armorType: null,
        hitPoints: 10,
        hitDice: '2d8',
        speed: '30 ft.',
        str: 10,
        dex: 10,
        con: 10,
        int: 2,
        wis: 10,
        cha: 5,
        savingThrows: null,
        skills: null,
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
        senses: 'Passive Perception 10',
        languages: '',
        challengeRating: 0.25,
        experiencePoints: 50,
        specialAbilities: null,
        actions: [{ name: 'Bite', description: 'Melee Attack' }],
        reactions: null,
        legendaryActions: null,
        description: null,
      },
    ]);
    mockLoadMagicItems.mockReturnValue([
      {
        name: 'Test Wand',
        category: 'Wondrous Item',
        description: 'A magical wand.',
        rarity: 'Uncommon',
        requiresAttunement: false,
        isMagic: true,
        properties: [],
      },
    ]);
    mockLoadSpecies.mockReturnValue([
      {
        name: 'Test Species',
        speed: 30,
        size: 'Medium',
        traits: [{ name: 'Darkvision', description: '60 ft.' }],
        languages: ['Common'],
        sizeDescription: 'about 5 feet tall',
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('loads data from JSON and calls createMany for all tables', async () => {
    await service.seed();

    expect(mockLoadSpells).toHaveBeenCalled();
    expect(mockLoadMonsters).toHaveBeenCalled();
    expect(mockLoadMagicItems).toHaveBeenCalled();
    expect(mockLoadSpecies).toHaveBeenCalled();
    expect(prisma.spell.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.monster.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.item.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.condition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.skill.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.language.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.srdClass.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.race.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it('merges mundane items with magic items from JSON', async () => {
    await service.seed();

    const itemsCall = prisma.item.createMany.mock.calls[0][0];
    // 5 mundane items from static data + 1 magic item from JSON mock
    expect(itemsCall.data).toHaveLength(6);
    expect(itemsCall.data[0].name).toBe('Longsword');
    expect(itemsCall.data[5].name).toBe('Test Wand');
    expect(itemsCall.data[5].isMagic).toBe(true);
  });

  it('uses species JSON data for races', async () => {
    await service.seed();

    const racesCall = prisma.race.createMany.mock.calls[0][0];
    expect(racesCall.data).toHaveLength(1);
    expect(racesCall.data[0].name).toBe('Test Species');
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

  it('creates dev admin user with admin role', async () => {
    await service.seed();

    const createCall = prisma.user.create.mock.calls[0][0].data;
    expect(createCall.role).toBe('admin');
  });
});
