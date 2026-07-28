import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { srdBackgrounds } from './data/backgrounds';
import * as seedGuards from './seed-guards';

// Mock the JSON loader module
jest.mock('./srd-json.loader', () => ({
  loadSpellsFromJson: jest.fn(),
  loadMonstersFromJson: jest.fn(),
  loadMagicItemsFromJson: jest.fn(),
  loadEquipmentFromJson: jest.fn(),
  loadSpeciesAsRacesFromJson: jest.fn(),
}));

import {
  loadSpellsFromJson,
  loadMonstersFromJson,
  loadMagicItemsFromJson,
  loadEquipmentFromJson,
  loadSpeciesAsRacesFromJson,
} from './srd-json.loader';

const mockLoadSpells = loadSpellsFromJson as jest.MockedFunction<typeof loadSpellsFromJson>;
const mockLoadMonsters = loadMonstersFromJson as jest.MockedFunction<typeof loadMonstersFromJson>;
const mockLoadMagicItems = loadMagicItemsFromJson as jest.MockedFunction<
  typeof loadMagicItemsFromJson
>;
const mockLoadEquipment = loadEquipmentFromJson as jest.MockedFunction<
  typeof loadEquipmentFromJson
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

    // Silence Nest Logger output during tests (SeedService logs via Logger).
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // SRD reference tables (spell/monster/item/feat) are now seeded via
    // findFirst→create/update scoped to contentSource='srd' (VEG-292). Default
    // findFirst to null so the create branch runs; individual tests override it.
    for (const model of [prisma.spell, prisma.monster, prisma.item, prisma.feat]) {
      model.createMany.mockResolvedValue({ count: 0 });
      model.findFirst.mockResolvedValue(null);
      model.create.mockResolvedValue({});
      model.update.mockResolvedValue({});
    }
    prisma.srdClass.createMany.mockResolvedValue({ count: 0 });
    prisma.srdClass.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `id-${args.where.name}`, name: args.where.name })
    );
    prisma.race.createMany.mockResolvedValue({ count: 0 });
    prisma.race.upsert.mockImplementation((args: any) =>
      Promise.resolve({ id: `id-${args.where.name}`, name: args.where.name })
    );
    prisma.background.createMany.mockResolvedValue({ count: 0 });
    prisma.background.findFirst.mockResolvedValue(null);
    prisma.background.create.mockImplementation((args: any) =>
      Promise.resolve({ id: `bg-${args.data.name}`, name: args.data.name })
    );
    prisma.background.update.mockResolvedValue({});
    prisma.condition.createMany.mockResolvedValue({ count: 0 });
    prisma.skill.createMany.mockResolvedValue({ count: 0 });
    prisma.language.createMany.mockResolvedValue({ count: 0 });
    prisma.classFeature.createMany.mockResolvedValue({ count: 0 });
    prisma.subclassFeature.createMany.mockResolvedValue({ count: 0 });
    prisma.raceTrait.createMany.mockResolvedValue({ count: 0 });
    prisma.raceTrait.upsert.mockResolvedValue({});
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
    // Feat FK resolution for background origin feats (VEG-429): id = `feat-<name>`.
    prisma.feat.findMany.mockImplementation((args: any) => {
      const names = (args?.where?.name?.in ?? []) as string[];
      return Promise.resolve(names.map(name => ({ id: `feat-${name}`, name })));
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
    mockLoadEquipment.mockReturnValue({
      items: [
        {
          name: 'Longsword',
          category: 'Martial Melee Weapon',
          cost: '15 GP',
          weight: 3,
          description: null,
          damage: '1d8',
          damageType: 'Slashing',
          armorClass: null,
          stealthDisadvantage: false,
          strengthRequirement: null,
          properties: ['Versatile (1d10)', 'Mastery: Sap'],
          isMagic: false,
        },
        {
          name: 'Backpack',
          category: 'Adventuring Gear',
          cost: '2 GP',
          weight: 5,
          description: 'Holds 30 pounds.',
          damage: null,
          damageType: null,
          armorClass: null,
          stealthDisadvantage: false,
          strengthRequirement: null,
          properties: [],
          isMagic: false,
        },
        {
          name: 'Explorer’s Pack',
          category: 'Equipment Pack',
          cost: '10 GP',
          weight: 55,
          description: 'Contains a Backpack.',
          damage: null,
          damageType: null,
          armorClass: null,
          stealthDisadvantage: false,
          strengthRequirement: null,
          properties: [],
          isMagic: false,
        },
      ],
      bundles: [{ bundleName: 'Explorer’s Pack', components: [{ name: 'Backpack', quantity: 1 }] }],
    });
    // Bundle FK resolution: items looked up by name get name-derived ids.
    prisma.item.findMany.mockImplementation((args: any) => {
      const names = (args?.where?.name?.in ?? []) as string[];
      return Promise.resolve(names.map(name => ({ id: `id-${name}`, name })));
    });
    prisma.item.deleteMany.mockResolvedValue({ count: 0 });
    prisma.itemBundleEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.itemBundleEntry.createMany.mockResolvedValue({ count: 0 });
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
    expect(prisma.spell.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Test Spell' }) })
    );
    expect(prisma.monster.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Test Monster' }) })
    );
    expect(prisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Longsword' }) })
    );
    expect(prisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Test Wand' }) })
    );
    expect(prisma.skill.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.language.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    // Classes and races are upserted by name (VEG-480), and conditions/game
    // rules by their unique key (VEG-449), not createMany'd — see the dedicated
    // re-seed block below.
    expect(prisma.srdClass.upsert).toHaveBeenCalled();
    expect(prisma.race.upsert).toHaveBeenCalled();
    expect(prisma.condition.upsert).toHaveBeenCalled();
    expect(prisma.gameRule.upsert).toHaveBeenCalled();
  });

  it('merges extracted equipment with magic items from JSON (no hand-authored stub)', async () => {
    await service.seed();

    // 3 equipment items from the extracted JSON + 1 magic item, each created by name.
    const createdItems = prisma.item.create.mock.calls.map(([args]: [any]) => args.data);
    expect(createdItems).toHaveLength(4);
    expect(createdItems[0].name).toBe('Longsword');
    expect(createdItems[0].isMagic).toBe(false);
    expect(createdItems[3].name).toBe('Test Wand');
    expect(createdItems[3].isMagic).toBe(true);
  });

  // ── Equipment seeding (VEG-308) ────────────────────────

  it('fails loudly before writing when an item name collides across sources', async () => {
    mockLoadMagicItems.mockReturnValue([
      {
        name: 'Longsword', // collides with the equipment dataset
        category: 'Weapon',
        description: 'A magic longsword.',
        rarity: 'Rare',
        requiresAttunement: false,
        isMagic: true,
        properties: [],
      },
    ]);

    await expect(service.seed()).rejects.toThrow(/Longsword/);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  // ── Class / race parent rows re-seed idempotently (VEG-480) ────────────
  //
  // These parents were createMany({ skipDuplicates: true }) — insert-only, so
  // edits to class/race data silently no-op'd on any database that already had
  // the rows. Upserting by name propagates corrections while preserving the
  // row id (child ClassFeature/RaceTrait/Subclass FKs resolve back to it by
  // name, so a delete-and-recreate would orphan them).
  describe('class/race parent re-seed (VEG-480)', () => {
    it('upserts each class by name rather than insert-only createMany', async () => {
      await service.seed();

      // createMany can only insert; on an existing DB it skips, so edits never
      // land. The upsert is what makes a re-seed actually update.
      expect(prisma.srdClass.createMany).not.toHaveBeenCalled();
      expect(prisma.srdClass.upsert).toHaveBeenCalled();

      const call = prisma.srdClass.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ name: expect.any(String) });
      // The update branch must carry the row's fields — an empty update would
      // reproduce the insert-only no-op the ticket fixes.
      expect(call.update.hitDie).toBeDefined();
      expect(call.create.hitDie).toBeDefined();
    });

    it('upserts each race by name rather than insert-only createMany', async () => {
      await service.seed();

      expect(prisma.race.createMany).not.toHaveBeenCalled();
      expect(prisma.race.upsert).toHaveBeenCalled();

      const call = prisma.race.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ name: expect.any(String) });
      // Assert a substantive field, not just a non-empty update: a name-only
      // `update: { name }` would be the insert-only no-op in disguise.
      expect(call.update.size).toBeDefined();
      expect(call.create.size).toBeDefined();
    });

    it('guards the class/race names for duplicates before the by-name upsert', async () => {
      // Upsert-by-name silently clobbers on a duplicate where createMany
      // first-wins skipped; the guard (used by every other by-name table)
      // makes a collision fail loudly instead. Assert the wiring is present so
      // it can't be dropped again.
      const guard = jest.spyOn(seedGuards, 'assertUniqueSeedNames');

      await service.seed();

      expect(guard).toHaveBeenCalledWith(
        'class',
        expect.objectContaining({
          'classes.ts': expect.arrayContaining(['Fighter']),
        })
      );
      expect(guard).toHaveBeenCalledWith('race', expect.any(Object));
    });

    it('seeds items before classes so equipment resolution can find them', async () => {
      // Unchanged by this ticket, but the parent upsert must not reorder the
      // phases: class starting-equipment resolution (VEG-462) reads the item
      // catalog, which seedItems must have populated first.
      await service.seed();

      const firstItemCreate = prisma.item.create.mock.invocationCallOrder[0];
      const firstClassUpsert = prisma.srdClass.upsert.mock.invocationCallOrder[0];
      expect(firstItemCreate).toBeLessThan(firstClassUpsert);
    });
  });

  it('seeds pack bundle entries in a second pass with resolved component ids', async () => {
    await service.seed();

    // Pass 2 resolves pack + component ids by name within the srd partition…
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contentSource: 'srd',
          name: { in: expect.arrayContaining(['Explorer’s Pack', 'Backpack']) },
        }),
      })
    );
    // …then rewrites each pack's entries idempotently (delete + recreate).
    expect(prisma.itemBundleEntry.deleteMany).toHaveBeenCalledWith({
      where: { bundleId: 'id-Explorer’s Pack' },
    });
    expect(prisma.itemBundleEntry.createMany).toHaveBeenCalledWith({
      data: [{ bundleId: 'id-Explorer’s Pack', componentId: 'id-Backpack', quantity: 1 }],
    });
    // Order matters: createMany after deleteMany, or every reseed would leave
    // the bundles empty while the calls-were-made assertions still pass.
    expect(prisma.itemBundleEntry.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.itemBundleEntry.createMany.mock.invocationCallOrder[0]
    );
  });

  it('logs how many stale srd items the cleanup retired', async () => {
    prisma.item.deleteMany.mockResolvedValue({ count: 2 });
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await service.seed();

    expect(log.mock.calls.map(c => c.join(' '))).toEqual(
      expect.arrayContaining([expect.stringMatching(/retired: 2/)])
    );
  });

  it('rejects duplicate names within a single dataset fed to the by-name upsert', async () => {
    mockLoadSpells.mockReturnValue([
      { name: 'Twin Spell' },
      { name: 'Twin Spell' },
    ] as unknown as ReturnType<typeof loadSpellsFromJson>);

    await expect(service.seed()).rejects.toThrow(/Twin Spell/);
    expect(prisma.spell.create).not.toHaveBeenCalled();
  });

  it('throws when a bundle name cannot be resolved to a seeded item', async () => {
    prisma.item.findMany.mockResolvedValue([]); // nothing resolves

    await expect(service.seed()).rejects.toThrow(/Explorer’s Pack/);
  });

  it('removes stale srd items no longer present in any source (old placeholders)', async () => {
    await service.seed();

    expect(prisma.item.deleteMany).toHaveBeenCalledWith({
      where: {
        contentSource: 'srd',
        name: { notIn: ['Longsword', 'Backpack', 'Explorer’s Pack', 'Test Wand'] },
      },
    });
  });

  // ── Content source (VEG-292) ───────────────────────────

  it('tags every seeded SRD row with contentSource "srd"', async () => {
    await service.seed();

    for (const model of [prisma.spell, prisma.monster, prisma.item, prisma.feat]) {
      expect(model.create).toHaveBeenCalled();
      for (const [args] of model.create.mock.calls) {
        expect(args.data.contentSource).toBe('srd');
      }
    }
  });

  it('scopes SRD seed lookups to the srd partition so homebrew rows never match', async () => {
    await service.seed();

    for (const model of [prisma.spell, prisma.monster, prisma.item, prisma.feat]) {
      expect(model.findFirst).toHaveBeenCalled();
      for (const [args] of model.findFirst.mock.calls) {
        expect(args.where).toMatchObject({ name: expect.any(String), contentSource: 'srd' });
      }
    }
  });

  it('updates an existing SRD row in place rather than creating a duplicate (idempotent reseed)', async () => {
    // Simulate the row already existing in the srd partition.
    prisma.spell.findFirst.mockResolvedValue({ id: 'existing-spell-id' });

    await service.seed();

    expect(prisma.spell.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-spell-id' },
        data: expect.objectContaining({ name: 'Test Spell', contentSource: 'srd' }),
      })
    );
    expect(prisma.spell.create).not.toHaveBeenCalled();
  });

  it('never deletes spells/monsters/feats on reseed (user homebrew survives)', async () => {
    await service.seed();

    for (const model of [prisma.spell, prisma.monster, prisma.feat]) {
      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(model.delete).not.toHaveBeenCalled();
    }
  });

  it('scopes the stale-item cleanup to the srd partition (user homebrew survives)', async () => {
    await service.seed();

    expect(prisma.item.delete).not.toHaveBeenCalled();
    expect(prisma.item.deleteMany).toHaveBeenCalledTimes(1);
    for (const [args] of prisma.item.deleteMany.mock.calls) {
      expect(args.where.contentSource).toBe('srd');
    }
  });

  it('uses species JSON data for races', async () => {
    await service.seed();

    const raceRows = prisma.race.upsert.mock.calls.map(([args]: [any]) => args.create);
    expect(raceRows).toHaveLength(1);
    expect(raceRows[0].name).toBe('Test Species');
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

    for (const [args] of prisma.srdClass.upsert.mock.calls) {
      expect(args.create).not.toHaveProperty('features');
      expect(args.update).not.toHaveProperty('features');
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

  it('upserts race traits into race_traits with FK to parent race so corrected text propagates', async () => {
    await service.seed();

    // Upsert (not createMany/skipDuplicates), keyed on the [raceId, name] unique, so the
    // VEG-273 lineage/ancestry option tables embedded in trait descriptions reach existing rows.
    expect(prisma.raceTrait.upsert).toHaveBeenCalled();
    for (const [args] of prisma.raceTrait.upsert.mock.calls) {
      expect(args.where.raceId_name).toMatchObject({
        raceId: expect.stringMatching(/^id-/),
        name: expect.any(String),
      });
      expect(args.create).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        raceId: expect.stringMatching(/^id-/),
      });
      expect(args.update).toMatchObject({ description: expect.any(String) });
      expect(args.create).not.toHaveProperty('level');
    }
  });

  it('does not write traits field on races anymore', async () => {
    await service.seed();

    for (const [args] of prisma.race.upsert.mock.calls) {
      expect(args.create).not.toHaveProperty('traits');
      expect(args.update).not.toHaveProperty('traits');
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

    expect(prisma.background.create).toHaveBeenCalled();
    for (const call of prisma.background.create.mock.calls) {
      expect(call[0].data).not.toHaveProperty('feature');
    }
  });

  it('resolves background-feature parent ids from the SRD partition (contentSource=srd)', async () => {
    await service.seed();

    // A homebrew background reusing an SRD name must never receive the seed's
    // child feature rows — the parent lookup is pinned to the srd partition.
    expect(prisma.background.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contentSource: 'srd' }) })
    );
  });

  // ── Background origin feats (VEG-429) ──────────────────

  it('resolves background origin feats from the SRD feat partition (contentSource=srd)', async () => {
    await service.seed();

    expect(prisma.feat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contentSource: 'srd' }) })
    );
  });

  it('writes the origin-feat FK into the background create (Acolyte→Magic Initiate/Cleric, Criminal→Alert)', async () => {
    await service.seed();

    const createByName = new Map(
      prisma.background.create.mock.calls.map((c: any) => [c[0].data.name, c[0].data])
    );

    expect(createByName.get('Acolyte')).toMatchObject({
      originFeatId: 'feat-Magic Initiate',
      originFeatOption: 'Cleric',
    });
    expect(createByName.get('Criminal')).toMatchObject({
      originFeatId: 'feat-Alert',
      originFeatOption: null,
    });
  });

  it('updates an existing SRD background in place, keeping the origin-feat link (reseed idempotency)', async () => {
    prisma.background.findFirst.mockImplementation((args: any) =>
      Promise.resolve({ id: `bg-${args.where.name}` })
    );

    await service.seed();

    expect(prisma.background.create).not.toHaveBeenCalled();
    const updateByName = new Map(
      prisma.background.update.mock.calls.map((c: any) => [c[0].data.name, c[0]])
    );
    const acolyte = updateByName.get('Acolyte');
    // Updates target the resolved SRD row id, never a bare name (which could
    // collide with a user's homebrew background of the same name).
    expect(acolyte.where).toEqual({ id: 'bg-Acolyte' });
    expect(acolyte.data).toMatchObject({
      originFeatId: 'feat-Magic Initiate',
      originFeatOption: 'Cleric',
    });
  });

  it('aborts the seed when a background origin feat does not resolve', async () => {
    // Force feat resolution to come back empty so no background can link.
    prisma.feat.findMany.mockResolvedValue([]);

    await expect(service.seed()).rejects.toThrow(/origin feat/i);
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

  it('seeds both loot-template families with explicit categories and scoped curated deletes', async () => {
    await service.seed();

    // Each family clears exactly its own curated rows — neither delete may
    // silently load-bear for the other.
    expect(prisma.npcLootTemplate.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated', category: 'npc' },
    });
    expect(prisma.npcLootTemplate.deleteMany).toHaveBeenCalledWith({
      where: { source: 'curated', category: 'monster' },
    });

    // Discriminate the createMany batches by row content, not call order.
    const batches = prisma.npcLootTemplate.createMany.mock.calls.map(c => c[0]);
    const npcRows = batches.flatMap(b =>
      b.data.filter((r: { category?: string }) => r.category === 'npc')
    );
    const monsterRows = batches.flatMap(b =>
      b.data.filter((r: { category?: string }) => r.category === 'monster')
    );
    expect(npcRows.length).toBeGreaterThan(0);
    expect(monsterRows.length).toBeGreaterThan(0);
    expect(npcRows.length + monsterRows.length).toBe(
      batches.reduce((n, b) => n + b.data.length, 0)
    );
    for (const row of monsterRows) {
      expect(typeof row.profession).toBe('string');
    }

    // skipDuplicates is inert on this table (no unique constraint) — it must
    // not reappear and imply protection that does not exist.
    for (const b of batches) {
      expect(b.skipDuplicates).toBeUndefined();
    }
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

  it('seeds the four npc-generation game-rule rows', async () => {
    await service.seed();

    const allCalls = prisma.gameRule.upsert.mock.calls.map(c => c[0].create);
    const npcRules = allCalls.filter((r: { category: string }) => r.category === 'npc-generation');
    const keys = npcRules.map((r: { key: string }) => r.key).sort();
    expect(keys).toEqual(
      ['coinage-multiplier', 'item-count-die', 'magic-item-chance-by-cr', 'trinket-chance'].sort()
    );
  });

  // VEG-449: both tables were insert-only (createMany + skipDuplicates), so an
  // edited rule or condition never reached a database that already had the row.
  // The exhaustion rule now drives the computed-stats penalty, making a silent
  // no-op on edit a correctness bug rather than mere staleness.
  it('upserts game rules by category+key so edited rule values reach seeded databases', async () => {
    await service.seed();

    expect(prisma.gameRule.createMany).not.toHaveBeenCalled();
    const exhaustion = prisma.gameRule.upsert.mock.calls.find(
      c => c[0].create.category === 'exhaustion' && c[0].create.key === 'levels'
    );
    expect(exhaustion).toBeDefined();
    expect(exhaustion![0].where).toEqual({
      category_key: { category: 'exhaustion', key: 'levels' },
    });
    // The update path carries the same row as the create path — an existing row
    // is rewritten, not left at its old value.
    expect(exhaustion![0].update).toEqual(exhaustion![0].create);
    expect(exhaustion![0].create.value).toMatchObject({
      maxLevel: 6,
      d20PenaltyPerLevel: 2,
      speedPenaltyFeetPerLevel: 5,
    });
  });

  it('upserts conditions by name so edited condition text reaches seeded databases', async () => {
    await service.seed();

    expect(prisma.condition.createMany).not.toHaveBeenCalled();
    const exhaustion = prisma.condition.upsert.mock.calls.find(
      c => c[0].create.name === 'Exhaustion'
    );
    expect(exhaustion).toBeDefined();
    expect(exhaustion![0].where).toEqual({ name: 'Exhaustion' });
    expect(exhaustion![0].update).toEqual(exhaustion![0].create);
  });

  it('guards background seed data against duplicate names (would otherwise silently clobber)', async () => {
    const guards = jest.requireActual<typeof import('./seed-guards')>('./seed-guards');
    const spy = jest.spyOn(guards, 'assertUniqueSeedNames');

    await service.seed();

    expect(spy).toHaveBeenCalledWith(
      'background',
      expect.objectContaining({ background: srdBackgrounds.map(b => b.name) })
    );
    spy.mockRestore();
  });

  it('seeds backgrounds scoped to the srd partition so homebrew rows are never touched', async () => {
    await service.seed();

    expect(prisma.background.findFirst).toHaveBeenCalled();
    for (const call of prisma.background.findFirst.mock.calls) {
      expect(call[0].where).toMatchObject({
        name: expect.any(String),
        contentSource: 'srd',
      });
    }
    expect(prisma.background.create).toHaveBeenCalled();
    for (const call of prisma.background.create.mock.calls) {
      const data = call[0].data;
      expect(data.contentSource).toBe('srd');
      expect(Array.isArray(data.personalityTraits)).toBe(true);
      expect(data.personalityTraits.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('invalidates the cache after a successful seed', async () => {
    await service.seed();
    expect(cache.clear).toHaveBeenCalledTimes(1);
  });
});
