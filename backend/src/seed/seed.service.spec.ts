import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { srdBackgrounds } from './data/backgrounds';

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
  let cache: { clear: jest.Mock };

  beforeEach(async () => {
    cache = { clear: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SeedService, prismaMockProvider(), { provide: CACHE_MANAGER, useValue: cache }],
    }).compile();

    service = module.get<SeedService>(SeedService);
    prisma = module.get<MockPrismaService>(PrismaService as any);

    // Silence console output during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    // All createMany resolve successfully
    prisma.spell.createMany.mockResolvedValue({ count: 0 });
    prisma.spell.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `spell-${args.where.name}`, name: args.where.name })
    );
    prisma.monster.createMany.mockResolvedValue({ count: 0 });
    prisma.monster.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `monster-${args.where.name}`, name: args.where.name })
    );
    prisma.item.createMany.mockResolvedValue({ count: 0 });
    prisma.item.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `item-${args.where.name}`, name: args.where.name })
    );
    prisma.srdClass.createMany.mockResolvedValue({ count: 0 });
    prisma.race.createMany.mockResolvedValue({ count: 0 });
    prisma.background.createMany.mockResolvedValue({ count: 0 });
    prisma.background.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `bg-${args.where.name}`, name: args.where.name })
    );
    prisma.feat.createMany.mockResolvedValue({ count: 0 });
    prisma.condition.createMany.mockResolvedValue({ count: 0 });
    prisma.skill.createMany.mockResolvedValue({ count: 0 });
    prisma.language.createMany.mockResolvedValue({ count: 0 });
    prisma.classFeature.createMany.mockResolvedValue({ count: 0 });
    prisma.subclassFeature.createMany.mockResolvedValue({ count: 0 });
    prisma.raceTrait.createMany.mockResolvedValue({ count: 0 });
    prisma.backgroundFeature.createMany.mockResolvedValue({ count: 0 });
    prisma.npcNamePool.createMany.mockResolvedValue({ count: 0 });
    prisma.npcNamePool.deleteMany.mockResolvedValue({ count: 0 });
    prisma.npcAppearanceTrait.createMany.mockResolvedValue({ count: 0 });
    prisma.npcAppearanceTrait.deleteMany.mockResolvedValue({ count: 0 });
    prisma.npcLootTemplate.createMany.mockResolvedValue({ count: 0 });
    prisma.npcLootTemplate.deleteMany.mockResolvedValue({ count: 0 });
    prisma.npcAlignmentPrior.createMany.mockResolvedValue({ count: 0 });
    prisma.npcAlignmentPrior.deleteMany.mockResolvedValue({ count: 0 });
    prisma.trinket.createMany.mockResolvedValue({ count: 0 });
    prisma.trinket.deleteMany.mockResolvedValue({ count: 0 });

    // FK resolution: findMany returns parent rows keyed by name, used to resolve FKs
    // for child feature rows. Default returns objects with `id` derived from `name`.
    const buildFkRows = (names: string[]) => names.map(name => ({ id: `id-${name}`, name }));
    prisma.srdClass.findMany.mockImplementation(args => {
      const names = (args?.where?.name?.in ?? []) as string[];
      return Promise.resolve(buildFkRows(names));
    });
    prisma.race.findMany.mockImplementation(args => {
      const names = (args?.where?.name?.in ?? []) as string[];
      return Promise.resolve(buildFkRows(names));
    });
    prisma.background.findMany.mockImplementation(args => {
      const names = (args?.where?.name?.in ?? []) as string[];
      return Promise.resolve(buildFkRows(names));
    });

    // Subclass/subrace FK resolution
    prisma.srdClass.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Fighter',
    });
    prisma.race.findUnique.mockResolvedValue({ id: 'race-1', name: 'Dwarf' });
    prisma.subclass.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `sub-${args.where.name}`, name: args.where.name })
    );
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
    expect(prisma.spell.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Test Spell' } })
    );
    expect(prisma.monster.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Test Monster' } })
    );
    expect(prisma.item.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Longsword' } })
    );
    expect(prisma.item.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Test Wand' } })
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

    // 5 mundane items from static data + 1 magic item from JSON mock, each upserted by name.
    const upsertedItems = prisma.item.upsert.mock.calls.map(([args]: [any]) => args.create);
    expect(upsertedItems).toHaveLength(6);
    expect(upsertedItems[0].name).toBe('Longsword');
    expect(upsertedItems[5].name).toBe('Test Wand');
    expect(upsertedItems[5].isMagic).toBe(true);
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

  // ── Normalized feature tables ──────────────────────────

  it('seeds class features into class_features with FK to parent class', async () => {
    await service.seed();

    expect(prisma.classFeature.createMany).toHaveBeenCalled();
    const call = prisma.classFeature.createMany.mock.calls[0][0];
    expect(call).toHaveProperty('skipDuplicates', true);
    expect(Array.isArray(call.data)).toBe(true);
    expect(call.data.length).toBeGreaterThan(0);
    for (const row of call.data) {
      expect(row).toMatchObject({
        name: expect.any(String),
        level: expect.any(Number),
        description: expect.any(String),
        classId: expect.stringMatching(/^id-/),
      });
    }
  });

  it('does not write features field on srd_classes anymore', async () => {
    await service.seed();

    const classesCall = prisma.srdClass.createMany.mock.calls[0][0];
    for (const row of classesCall.data) {
      expect(row).not.toHaveProperty('features');
    }
  });

  it('seeds subclass features into subclass_features with FK to parent subclass', async () => {
    await service.seed();

    expect(prisma.subclassFeature.createMany).toHaveBeenCalled();
    const call = prisma.subclassFeature.createMany.mock.calls[0][0];
    expect(call).toHaveProperty('skipDuplicates', true);
    expect(Array.isArray(call.data)).toBe(true);
    for (const row of call.data) {
      expect(row).toMatchObject({
        name: expect.any(String),
        level: expect.any(Number),
        description: expect.any(String),
        subclassId: expect.stringMatching(/^sub-/),
      });
    }
  });

  it('does not pass features to subclass.upsert anymore', async () => {
    await service.seed();

    for (const call of prisma.subclass.upsert.mock.calls) {
      const args = call[0];
      expect(args.create).not.toHaveProperty('features');
      expect(args.update).not.toHaveProperty('features');
    }
  });

  it('seeds race traits into race_traits with FK to parent race', async () => {
    await service.seed();

    expect(prisma.raceTrait.createMany).toHaveBeenCalled();
    const call = prisma.raceTrait.createMany.mock.calls[0][0];
    expect(call).toHaveProperty('skipDuplicates', true);
    for (const row of call.data) {
      expect(row).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        raceId: expect.stringMatching(/^id-/),
      });
      expect(row).not.toHaveProperty('level');
    }
  });

  it('does not write traits field on races anymore', async () => {
    await service.seed();

    const racesCall = prisma.race.createMany.mock.calls[0][0];
    for (const row of racesCall.data) {
      expect(row).not.toHaveProperty('traits');
    }
  });

  it('only seeds background features when source data has a non-null feature', async () => {
    // SRD 5.2.1 backgrounds all have feature: null (the personality data lives
    // on Background directly). Once a background gains a non-null feature in
    // the source data, this test will start asserting the createMany shape.
    const withFeature = srdBackgrounds.filter(b => b.feature !== null);

    await service.seed();

    if (withFeature.length === 0) {
      expect(prisma.backgroundFeature.createMany).not.toHaveBeenCalled();
      return;
    }

    expect(prisma.backgroundFeature.createMany).toHaveBeenCalled();
    const call = prisma.backgroundFeature.createMany.mock.calls[0][0];
    expect(call).toHaveProperty('skipDuplicates', true);
    for (const row of call.data) {
      expect(row).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        backgroundId: expect.stringMatching(/^id-/),
      });
    }
  });

  it('does not write feature field on backgrounds anymore', async () => {
    await service.seed();

    expect(prisma.background.upsert).toHaveBeenCalled();
    for (const call of prisma.background.upsert.mock.calls) {
      const args = call[0];
      expect(args.create).not.toHaveProperty('feature');
      expect(args.update).not.toHaveProperty('feature');
    }
  });

  // ── NPC Generator reference tables ─────────────────────

  it('seeds NPC name pools after clearing curated rows (idempotent)', async () => {
    await service.seed();

    expect(prisma.npcNamePool.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated' },
    });
    expect(prisma.npcNamePool.createMany).toHaveBeenCalled();
    const call = prisma.npcNamePool.createMany.mock.calls[0][0];
    expect(call.data.length).toBeGreaterThan(0);
  });

  it('seeds NPC appearance traits after clearing curated rows', async () => {
    await service.seed();

    expect(prisma.npcAppearanceTrait.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated' },
    });
    expect(prisma.npcAppearanceTrait.createMany).toHaveBeenCalled();
    const call = prisma.npcAppearanceTrait.createMany.mock.calls[0][0];
    expect(call.data.length).toBeGreaterThan(0);
  });

  it('seeds NPC loot templates after clearing curated rows', async () => {
    await service.seed();

    expect(prisma.npcLootTemplate.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated' },
    });
    expect(prisma.npcLootTemplate.createMany).toHaveBeenCalled();
    const call = prisma.npcLootTemplate.createMany.mock.calls[0][0];
    expect(call.data.length).toBeGreaterThan(0);
  });

  it('seeds NPC alignment priors after clearing curated rows (compound unique with nullable background prevents upsert)', async () => {
    await service.seed();

    expect(prisma.npcAlignmentPrior.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated' },
    });
    expect(prisma.npcAlignmentPrior.createMany).toHaveBeenCalled();
    const call = prisma.npcAlignmentPrior.createMany.mock.calls[0][0];
    expect(call.data.length).toBeGreaterThan(0);
    for (const row of call.data) {
      expect(Array.isArray(row.weights)).toBe(true);
      expect(row.weights.length).toBe(9);
    }
  });

  it('seeds trinkets after clearing curated/srd rows', async () => {
    await service.seed();

    expect(prisma.trinket.deleteMany).toHaveBeenCalled();
    expect(prisma.trinket.createMany).toHaveBeenCalled();
    const call = prisma.trinket.createMany.mock.calls[0][0];
    expect(call.data.length).toBeGreaterThanOrEqual(100);
  });

  it('never touches npc_custom_personality rows on reseed (user contributions survive)', async () => {
    await service.seed();

    expect(prisma.npcCustomPersonality.deleteMany).not.toHaveBeenCalled();
    expect(prisma.npcCustomPersonality.createMany).not.toHaveBeenCalled();
    expect(prisma.npcCustomPersonality.delete).not.toHaveBeenCalled();
    expect(prisma.npcCustomPersonality.update).not.toHaveBeenCalled();
  });

  it('seeds the four new npc-generation game-rule rows via createMany', async () => {
    await service.seed();

    const allCalls = prisma.gameRule.createMany.mock.calls.flatMap(c => c[0].data);
    const npcRules = allCalls.filter((r: { category: string }) => r.category === 'npc-generation');
    const keys = npcRules.map((r: { key: string }) => r.key).sort();
    expect(keys).toEqual(
      ['coinage-multiplier', 'item-count-die', 'magic-item-chance-by-cr', 'trinket-chance'].sort()
    );
  });

  it('upserts backgrounds by name so reseed overwrites personality arrays', async () => {
    await service.seed();

    expect(prisma.background.upsert).toHaveBeenCalled();
    for (const call of prisma.background.upsert.mock.calls) {
      const args = call[0];
      expect(args.where).toHaveProperty('name');
      expect(args.create).toEqual(args.update);
      expect(Array.isArray(args.create.personalityTraits)).toBe(true);
      expect(args.create.personalityTraits.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('invalidates the cache after a successful seed', async () => {
    await service.seed();
    expect(cache.clear).toHaveBeenCalledTimes(1);
  });
});
