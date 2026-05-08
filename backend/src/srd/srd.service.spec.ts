import { Test, TestingModule } from '@nestjs/testing';
import { SrdService } from './srd.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';

describe('SrdService', () => {
  let service: SrdService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SrdService, prismaMockProvider()],
    }).compile();

    service = module.get<SrdService>(SrdService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Spells ──────────────────────────────────────────

  describe('searchSpells', () => {
    it('passes empty where when no filters provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      const result = await service.searchSpells({});

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, lastPage: 1 });
    });

    it('builds OR contains insensitive when query provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      await service.searchSpells({ q: 'fire' });

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'fire', mode: 'insensitive' } },
            { description: { contains: 'fire', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds classes has filter when classFilter provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      await service.searchSpells({ class: 'Wizard' });

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          classes: { has: 'Wizard' },
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds school filter when school provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      await service.searchSpells({ school: 'Evocation' });

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          school: 'Evocation',
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });
  });

  // ── Monsters ────────────────────────────────────────

  describe('searchMonsters', () => {
    it('applies parseFloat on cr filter', async () => {
      prisma.monster.findMany.mockResolvedValue([]);
      prisma.monster.count.mockResolvedValue(0);

      await service.searchMonsters({ cr: '0.25' });

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          challengeRating: 0.25,
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds size filter when provided', async () => {
      prisma.monster.findMany.mockResolvedValue([]);
      prisma.monster.count.mockResolvedValue(0);

      await service.searchMonsters({ size: 'Large' });

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          size: 'Large',
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds minCr and maxCr range filter', async () => {
      prisma.monster.findMany.mockResolvedValue([]);
      prisma.monster.count.mockResolvedValue(0);

      await service.searchMonsters({ minCr: '5', maxCr: '10' });

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          challengeRating: { gte: 5, lte: 10 },
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });
  });

  // ── Items ───────────────────────────────────────────

  describe('searchItems', () => {
    it('adds category filter when provided', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.searchItems({ category: 'Potion' });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          category: 'Potion',
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds rarity filter when provided', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.searchItems({ rarity: 'Rare' });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          rarity: 'Rare',
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('adds isMagic filter when provided', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.searchItems({ isMagic: 'true' });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          isMagic: true,
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });
  });

  // ── Classes ─────────────────────────────────────────

  describe('findAllClasses', () => {
    it('returns all classes ordered by name with features included', async () => {
      const classes = [{ id: '1', name: 'Fighter', features: [] }];
      prisma.srdClass.findMany.mockResolvedValue(classes);

      const result = await service.findAllClasses();

      expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      });
      expect(result).toEqual(classes);
    });
  });

  describe('findClass', () => {
    it('includes subclasses and features (with subclass features) ordered', async () => {
      prisma.srdClass.findUnique.mockResolvedValue({
        id: '1',
        name: 'Fighter',
        subclasses: [],
        features: [],
      });

      await service.findClass('1');

      expect(prisma.srdClass.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          subclasses: {
            include: { features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
          },
          features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] },
        },
      });
    });
  });

  // ── Races ───────────────────────────────────────────

  describe('findAllRaces', () => {
    it('returns all races ordered by name with traits included', async () => {
      const races = [{ id: '1', name: 'Elf', traits: [] }];
      prisma.race.findMany.mockResolvedValue(races);

      const result = await service.findAllRaces();

      expect(prisma.race.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { traits: { orderBy: { name: 'asc' } } },
      });
      expect(result).toEqual(races);
    });
  });

  describe('findRace', () => {
    it('includes subraces and traits relations', async () => {
      prisma.race.findUnique.mockResolvedValue({
        id: '1',
        name: 'Elf',
        subraces: [],
        traits: [],
      });

      await service.findRace('1');

      expect(prisma.race.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          subraces: true,
          traits: { orderBy: { name: 'asc' } },
        },
      });
    });
  });

  // ── Subclasses ──────────────────────────────────────

  describe('searchSubclasses', () => {
    it('passes empty where when no filter, with features included', async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses();

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
        include: { features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      });
    });

    it('filters by classId, with features included', async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses('class-1');

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: { classId: 'class-1' },
        orderBy: { name: 'asc' },
        include: { features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      });
    });
  });

  // ── Subraces ────────────────────────────────────────

  describe('searchSubraces', () => {
    it('filters by raceId', async () => {
      prisma.subrace.findMany.mockResolvedValue([]);

      await service.searchSubraces('race-1');

      expect(prisma.subrace.findMany).toHaveBeenCalledWith({
        where: { raceId: 'race-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Backgrounds ─────────────────────────────────────

  describe('searchBackgrounds', () => {
    it('passes empty where when no query', async () => {
      prisma.background.findMany.mockResolvedValue([]);

      await service.searchBackgrounds();

      expect(prisma.background.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Feats ───────────────────────────────────────────

  describe('searchFeats', () => {
    it('passes empty where when no query', async () => {
      prisma.feat.findMany.mockResolvedValue([]);

      await service.searchFeats();

      expect(prisma.feat.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Conditions ──────────────────────────────────────

  describe('findAllConditions', () => {
    it('returns all conditions ordered by name', async () => {
      prisma.condition.findMany.mockResolvedValue([]);

      await service.findAllConditions();

      expect(prisma.condition.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Skills ──────────────────────────────────────────

  describe('searchSkills', () => {
    it('filters by ability', async () => {
      prisma.skill.findMany.mockResolvedValue([]);

      await service.searchSkills('Dexterity');

      expect(prisma.skill.findMany).toHaveBeenCalledWith({
        where: { ability: 'Dexterity' },
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Languages ───────────────────────────────────────

  describe('searchLanguages', () => {
    it('filters by type', async () => {
      prisma.language.findMany.mockResolvedValue([]);

      await service.searchLanguages('Standard');

      expect(prisma.language.findMany).toHaveBeenCalledWith({
        where: { type: 'Standard' },
        orderBy: { name: 'asc' },
      });
    });
  });

  // ── Game Rules ─────────────────────────────────────

  describe('findAllRules', () => {
    it('returns all game rules ordered by category then key', async () => {
      const mockRules = [
        { id: '1', category: 'hp-calculation', key: 'rules', value: {}, source: 'SRD 5.2.1' },
        { id: '2', category: 'proficiency-bonus', key: 'table', value: {}, source: 'SRD 5.2.1' },
      ];
      prisma.gameRule.findMany.mockResolvedValue(mockRules);

      const result = await service.findAllRules();

      expect(prisma.gameRule.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      expect(result).toEqual(mockRules);
    });
  });

  describe('findRulesByCategory', () => {
    it('filters rules by category', async () => {
      const mockRules = [
        { id: '1', category: 'proficiency-bonus', key: 'formula', value: {}, source: 'SRD 5.2.1' },
        { id: '2', category: 'proficiency-bonus', key: 'table', value: {}, source: 'SRD 5.2.1' },
      ];
      prisma.gameRule.findMany.mockResolvedValue(mockRules);

      const result = await service.findRulesByCategory('proficiency-bonus');

      expect(prisma.gameRule.findMany).toHaveBeenCalledWith({
        where: { category: 'proficiency-bonus' },
        orderBy: { key: 'asc' },
      });
      expect(result).toEqual(mockRules);
    });
  });

  // ── Find-by-ID methods ─────────────────────────────

  describe('findSpell', () => {
    it('returns spell by id', async () => {
      const spell = { id: '1', name: 'Fireball' };
      prisma.spell.findUnique.mockResolvedValue(spell);

      const result = await service.findSpell('1');

      expect(prisma.spell.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(spell);
    });
  });

  describe('findMonster', () => {
    it('returns monster by id', async () => {
      const monster = { id: '1', name: 'Dragon' };
      prisma.monster.findUnique.mockResolvedValue(monster);

      const result = await service.findMonster('1');

      expect(prisma.monster.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(monster);
    });
  });

  describe('findItem', () => {
    it('returns item by id', async () => {
      const item = { id: '1', name: 'Healing Potion' };
      prisma.item.findUnique.mockResolvedValue(item);

      const result = await service.findItem('1');

      expect(prisma.item.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(item);
    });
  });

  describe('findSubclass', () => {
    it('returns subclass by id with features included', async () => {
      const subclass = { id: '1', name: 'Champion', features: [] };
      prisma.subclass.findUnique.mockResolvedValue(subclass);

      const result = await service.findSubclass('1');

      expect(prisma.subclass.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { features: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      });
      expect(result).toEqual(subclass);
    });
  });

  describe('findSubrace', () => {
    it('returns subrace by id', async () => {
      const subrace = { id: '1', name: 'High Elf' };
      prisma.subrace.findUnique.mockResolvedValue(subrace);

      const result = await service.findSubrace('1');

      expect(prisma.subrace.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(subrace);
    });
  });

  describe('findBackground', () => {
    it('returns background by id with features included', async () => {
      const bg = { id: '1', name: 'Noble', features: [] };
      prisma.background.findUnique.mockResolvedValue(bg);

      const result = await service.findBackground('1');

      expect(prisma.background.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { features: { orderBy: { name: 'asc' } } },
      });
      expect(result).toEqual(bg);
    });
  });

  describe('findFeat', () => {
    it('returns feat by id', async () => {
      const feat = { id: '1', name: 'Tough' };
      prisma.feat.findUnique.mockResolvedValue(feat);

      const result = await service.findFeat('1');

      expect(prisma.feat.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(feat);
    });
  });

  describe('findCondition', () => {
    it('returns condition by id', async () => {
      const condition = { id: '1', name: 'Blinded' };
      prisma.condition.findUnique.mockResolvedValue(condition);

      const result = await service.findCondition('1');

      expect(prisma.condition.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(condition);
    });
  });

  describe('findSkill', () => {
    it('returns skill by id', async () => {
      const skill = { id: '1', name: 'Acrobatics' };
      prisma.skill.findUnique.mockResolvedValue(skill);

      const result = await service.findSkill('1');

      expect(prisma.skill.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(skill);
    });
  });

  describe('findLanguage', () => {
    it('returns language by id', async () => {
      const lang = { id: '1', name: 'Common' };
      prisma.language.findUnique.mockResolvedValue(lang);

      const result = await service.findLanguage('1');

      expect(prisma.language.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(lang);
    });
  });

  // ── Features (cross-parent search) ──────────────────

  describe('searchFeatures', () => {
    beforeEach(() => {
      prisma.classFeature.findMany.mockResolvedValue([]);
      prisma.classFeature.count.mockResolvedValue(0);
      prisma.subclassFeature.findMany.mockResolvedValue([]);
      prisma.subclassFeature.count.mockResolvedValue(0);
      prisma.raceTrait.findMany.mockResolvedValue([]);
      prisma.raceTrait.count.mockResolvedValue(0);
      prisma.backgroundFeature.findMany.mockResolvedValue([]);
      prisma.backgroundFeature.count.mockResolvedValue(0);
    });

    it('queries all four feature tables when no parentType filter', async () => {
      await service.searchFeatures({});

      expect(prisma.classFeature.findMany).toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).toHaveBeenCalled();
    });

    it('queries only the requested parentType', async () => {
      await service.searchFeatures({ parentType: 'class' });

      expect(prisma.classFeature.findMany).toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).not.toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).not.toHaveBeenCalled();
    });

    it('filters by name with case-insensitive contains', async () => {
      await service.searchFeatures({ q: 'rage' });

      const call = prisma.classFeature.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({
        name: { contains: 'rage', mode: 'insensitive' },
      });
    });

    it('filters by parentId on the matching parent column', async () => {
      await service.searchFeatures({ parentType: 'class', parentId: 'cls-1' });

      const call = prisma.classFeature.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ classId: 'cls-1' });
    });

    it('returns discriminated rows tagged with kind and parent info', async () => {
      prisma.classFeature.findMany.mockResolvedValue([
        {
          id: 'cf-1',
          name: 'Rage',
          level: 1,
          description: 'Bonus action.',
          classId: 'cls-1',
          class: { id: 'cls-1', name: 'Barbarian' },
        },
      ]);
      prisma.classFeature.count.mockResolvedValue(1);

      const result = await service.searchFeatures({ parentType: 'class' });

      expect(result.data[0]).toMatchObject({
        kind: 'class',
        id: 'cf-1',
        name: 'Rage',
        level: 1,
        description: 'Bonus action.',
        parent: { id: 'cls-1', name: 'Barbarian' },
      });
      expect(result.total).toBe(1);
    });

    it('paginates by combined total across all tables', async () => {
      prisma.classFeature.count.mockResolvedValue(3);
      prisma.subclassFeature.count.mockResolvedValue(2);
      prisma.raceTrait.count.mockResolvedValue(4);
      prisma.backgroundFeature.count.mockResolvedValue(1);

      const result = await service.searchFeatures({});

      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
    });

    it('respects page and limit defaults (page 1, limit 20) on the response shape', async () => {
      const result = await service.searchFeatures({});

      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
      expect(result.data.length).toBeLessThanOrEqual(20);
    });

    it('paginates the merged in-memory list by page/limit slice', async () => {
      const makeRow = (i: number) => ({
        id: `cf-${i}`,
        name: `Feat ${String(i).padStart(2, '0')}`,
        level: 1,
        description: 'd',
        classId: 'cls-1',
        class: { id: 'cls-1', name: 'Barb' },
      });
      prisma.classFeature.findMany.mockResolvedValue([1, 2, 3, 4, 5].map(makeRow));
      prisma.classFeature.count.mockResolvedValue(5);

      const result = await service.searchFeatures({ parentType: 'class', page: 2, limit: 2 });

      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
      expect(result.lastPage).toBe(3);
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as { name: string }).name).toBe('Feat 03');
    });
  });

  // ── Unified search (spells + feats + features) ──────

  describe('search (unified)', () => {
    beforeEach(() => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);
      prisma.feat.findMany.mockResolvedValue([]);
      prisma.feat.count.mockResolvedValue(0);
      prisma.classFeature.findMany.mockResolvedValue([]);
      prisma.classFeature.count.mockResolvedValue(0);
      prisma.subclassFeature.findMany.mockResolvedValue([]);
      prisma.subclassFeature.count.mockResolvedValue(0);
      prisma.raceTrait.findMany.mockResolvedValue([]);
      prisma.raceTrait.count.mockResolvedValue(0);
      prisma.backgroundFeature.findMany.mockResolvedValue([]);
      prisma.backgroundFeature.count.mockResolvedValue(0);
    });

    it('queries all three types when no types filter provided', async () => {
      await service.search({});

      expect(prisma.spell.findMany).toHaveBeenCalled();
      expect(prisma.feat.findMany).toHaveBeenCalled();
      expect(prisma.classFeature.findMany).toHaveBeenCalled();
    });

    it('only queries the spell table when types=["spell"]', async () => {
      await service.search({ types: ['spell'] });

      expect(prisma.spell.findMany).toHaveBeenCalled();
      expect(prisma.feat.findMany).not.toHaveBeenCalled();
      expect(prisma.classFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).not.toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).not.toHaveBeenCalled();
    });

    it('only queries the feat table when types=["feat"]', async () => {
      await service.search({ types: ['feat'] });

      expect(prisma.feat.findMany).toHaveBeenCalled();
      expect(prisma.spell.findMany).not.toHaveBeenCalled();
      expect(prisma.classFeature.findMany).not.toHaveBeenCalled();
    });

    it('only queries the feature tables when types=["feature"]', async () => {
      await service.search({ types: ['feature'] });

      expect(prisma.spell.findMany).not.toHaveBeenCalled();
      expect(prisma.feat.findMany).not.toHaveBeenCalled();
      expect(prisma.classFeature.findMany).toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).toHaveBeenCalled();
    });

    it('applies q to name and description across all types (case-insensitive contains)', async () => {
      await service.search({ q: 'fire' });

      const spellCall = prisma.spell.findMany.mock.calls[0][0];
      expect(spellCall.where).toMatchObject({
        OR: [
          { name: { contains: 'fire', mode: 'insensitive' } },
          { description: { contains: 'fire', mode: 'insensitive' } },
        ],
      });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({
        OR: [
          { name: { contains: 'fire', mode: 'insensitive' } },
          { description: { contains: 'fire', mode: 'insensitive' } },
        ],
      });

      const classFeatureCall = prisma.classFeature.findMany.mock.calls[0][0];
      expect(classFeatureCall.where).toMatchObject({
        OR: [
          { name: { contains: 'fire', mode: 'insensitive' } },
          { description: { contains: 'fire', mode: 'insensitive' } },
        ],
      });
    });

    it('applies spell sub-filters (class, level, school)', async () => {
      await service.search({
        types: ['spell'],
        class: 'Wizard',
        level: 3,
        school: 'Evocation',
      });

      const spellCall = prisma.spell.findMany.mock.calls[0][0];
      expect(spellCall.where).toMatchObject({
        classes: { has: 'Wizard' },
        level: 3,
        school: 'Evocation',
      });
    });

    it('applies hasPrerequisite=true filter', async () => {
      await service.search({
        types: ['feat'],
        hasPrerequisite: 'true',
      });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({
        prerequisite: { not: null },
      });
    });

    it('treats hasPrerequisite=false as "no prerequisite"', async () => {
      await service.search({ types: ['feat'], hasPrerequisite: 'false' });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({ prerequisite: null });
    });

    it('applies feature parentType filter (only that table is queried)', async () => {
      await service.search({ types: ['feature'], parentType: 'class' });

      expect(prisma.classFeature.findMany).toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).not.toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).not.toHaveBeenCalled();
    });

    it('applies feature parentId on the matching column', async () => {
      await service.search({ types: ['feature'], parentType: 'class', parentId: 'cls-1' });

      const call = prisma.classFeature.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ classId: 'cls-1' });
    });

    it('returns spell hits as {kind, data} with full Spell payload', async () => {
      const fullSpell = {
        id: 'sp-1',
        name: 'Fireball',
        level: 3,
        school: 'Evocation',
        castingTime: '1 action',
        range: '150 feet',
        components: 'V, S, M',
        duration: 'Instantaneous',
        description: 'A bright streak.',
        classes: ['Sorcerer', 'Wizard'],
        ritual: false,
        concentration: false,
        material: 'A tiny ball of bat guano and sulfur',
        higherLevels: 'Higher slot increases damage by 1d6.',
        source: 'SRD 5.2.1',
      };
      prisma.spell.findMany.mockResolvedValue([fullSpell]);
      prisma.spell.count.mockResolvedValue(1);

      const result = await service.search({ types: ['spell'] });

      expect(result.data[0]).toEqual({ kind: 'spell', data: fullSpell });
    });

    it('returns feat hits as {kind, data} with full Feat payload (incl. category, repeatable, benefits)', async () => {
      const fullFeat = {
        id: 'feat-1',
        name: 'Sharpshooter',
        prerequisite: null,
        description: 'You have mastered ranged weapons.',
        benefits: ['No long-range disadvantage', 'Ignore half/three-quarters cover'],
        category: 'General',
        repeatable: false,
        source: 'SRD 5.2.1',
      };
      prisma.feat.findMany.mockResolvedValue([fullFeat]);
      prisma.feat.count.mockResolvedValue(1);

      const result = await service.search({ types: ['feat'] });

      expect(result.data[0]).toEqual({ kind: 'feat', data: fullFeat });
    });

    it('returns feature hits as {kind, data} with parent metadata', async () => {
      prisma.classFeature.findMany.mockResolvedValue([
        {
          id: 'cf-1',
          name: 'Sneak Attack',
          level: 1,
          description: 'Deals extra damage.',
          classId: 'cls-1',
          class: { id: 'cls-1', name: 'Rogue' },
        },
      ]);
      prisma.classFeature.count.mockResolvedValue(1);

      const result = await service.search({ types: ['feature'], parentType: 'class' });

      expect(result.data[0]).toEqual({
        kind: 'feature',
        data: {
          id: 'cf-1',
          name: 'Sneak Attack',
          level: 1,
          description: 'Deals extra damage.',
          parent: { kind: 'class', id: 'cls-1', name: 'Rogue' },
        },
      });
    });

    it('applies feat category filter when provided', async () => {
      await service.search({ types: ['feat'], category: 'Origin' });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({ category: 'Origin' });
    });

    it('applies feat repeatable=true filter as boolean', async () => {
      await service.search({ types: ['feat'], repeatable: 'true' });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({ repeatable: true });
    });

    it('applies feat repeatable=false filter as boolean', async () => {
      await service.search({ types: ['feat'], repeatable: 'false' });

      const featCall = prisma.feat.findMany.mock.calls[0][0];
      expect(featCall.where).toMatchObject({ repeatable: false });
    });

    it('combines totals across all queried tables', async () => {
      prisma.spell.count.mockResolvedValue(3);
      prisma.feat.count.mockResolvedValue(2);
      prisma.classFeature.count.mockResolvedValue(4);
      prisma.subclassFeature.count.mockResolvedValue(1);
      prisma.raceTrait.count.mockResolvedValue(0);
      prisma.backgroundFeature.count.mockResolvedValue(0);

      const result = await service.search({});

      expect(result.total).toBe(10);
    });

    it('sorts merged results alphabetically by data.name and slices by page/limit', async () => {
      prisma.spell.findMany.mockResolvedValue([
        { id: 's1', name: 'Bless', level: 1, school: 'Enchantment', description: '' },
        { id: 's2', name: 'Fireball', level: 3, school: 'Evocation', description: '' },
      ]);
      prisma.spell.count.mockResolvedValue(2);
      prisma.feat.findMany.mockResolvedValue([
        { id: 'f1', name: 'Alert', prerequisite: null, description: '' },
      ]);
      prisma.feat.count.mockResolvedValue(1);

      const result = await service.search({ types: ['spell', 'feat'], page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.lastPage).toBe(2);
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as { data: { name: string } }).data.name).toBe('Alert');
      expect((result.data[1] as { data: { name: string } }).data.name).toBe('Bless');
    });
  });
});
