import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SrdService } from './srd.service';
import { ContentAccessService } from './content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';

// Every public /srd read is pinned to the global catalog — SRD + admin-published
// shared content — so owner-scoped homebrew never leaks (VEG-311).
const GLOBAL_WHERE = { contentSource: { in: ['srd', 'shared'] } };

describe('SrdService', () => {
  let service: SrdService;
  let prisma: MockPrismaService;
  let cache: { clear: jest.Mock };

  beforeEach(async () => {
    cache = { clear: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SrdService,
        ContentAccessService,
        prismaMockProvider(),
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get<SrdService>(SrdService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Spells ──────────────────────────────────────────

  describe('searchSpells', () => {
    type SqlFragment = { sql: string; values: unknown[] };

    function captureSql() {
      const calls = prisma.$queryRaw.mock.calls;
      return {
        dataQuery: calls[0]?.[0] as SqlFragment | undefined,
        countQuery: calls[1]?.[0] as SqlFragment | undefined,
      };
    }

    it('passes empty where when no filters provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      const result = await service.searchSpells({});

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: { ...GLOBAL_WHERE },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, lastPage: 1 });
    });

    it('uses pg_trgm similarity via $queryRaw when query is ≥2 chars', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchSpells({ q: 'fire' });

      expect(prisma.spell.findMany).not.toHaveBeenCalled();
      const { dataQuery, countQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"spells"');
      expect(dataQuery?.sql).toContain('"contentSource"');
      expect(countQuery?.sql).toContain('"contentSource"');
      expect(dataQuery?.values).toContain('srd');
      expect(dataQuery?.values).toContain('shared');
      expect(dataQuery?.sql).toContain('similarity');
      expect(dataQuery?.sql).toContain('ILIKE');
      expect(dataQuery?.sql).toContain('ORDER BY');
      expect(dataQuery?.sql).toContain('LIMIT');
      expect(dataQuery?.sql).toContain('OFFSET');
      expect(dataQuery?.values).toContain('fire');
      expect(dataQuery?.values).toContain('%fire%');
      expect(countQuery?.sql).toContain('COUNT');
      expect(countQuery?.sql).toContain('"spells"');
    });

    it('keeps exact substring matches scored highest (ILIKE branch beats similarity)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchSpells({ q: 'Fireball' });

      const { dataQuery } = captureSql();
      // ILIKE substring branch must precede similarity branch in the score CASE.
      const ilikeIdx = dataQuery?.sql.indexOf('ILIKE') ?? -1;
      const simIdx = dataQuery?.sql.indexOf('similarity') ?? -1;
      expect(ilikeIdx).toBeGreaterThanOrEqual(0);
      expect(simIdx).toBeGreaterThanOrEqual(0);
      expect(ilikeIdx).toBeLessThan(simIdx);
    });

    it('falls back to legacy findMany substring path for single-char queries', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      await service.searchSpells({ q: 'a' });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
          OR: [
            { name: { contains: 'a', mode: 'insensitive' } },
            { description: { contains: 'a', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('applies class/level/school filters alongside fuzzy search SQL', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchSpells({ q: 'fire', class: 'Wizard', level: 3, school: 'Evocation' });

      const { dataQuery } = captureSql();
      expect(dataQuery?.sql).toMatch(/ANY\s*\(\s*"classes"\s*\)/);
      expect(dataQuery?.sql).toContain('"level"');
      expect(dataQuery?.sql).toContain('"school"');
      expect(dataQuery?.values).toContain('Wizard');
      expect(dataQuery?.values).toContain(3);
      expect(dataQuery?.values).toContain('Evocation');
    });

    it('paginates fuzzy results via SQL LIMIT/OFFSET and returns total from count query', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 42 }]);

      const result = await service.searchSpells({ q: 'fire', page: 3, limit: 10 });

      const { dataQuery } = captureSql();
      expect(dataQuery?.values).toContain(10);
      expect(dataQuery?.values).toContain(20);
      expect(result.total).toBe(42);
      expect(result.page).toBe(3);
      expect(result.lastPage).toBe(Math.ceil(42 / 10));
    });

    it('adds classes has filter when classFilter provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.spell.count.mockResolvedValue(0);

      await service.searchSpells({ class: 'Wizard' });

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
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
          ...GLOBAL_WHERE,
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
    type SqlFragment = { sql: string; values: unknown[] };

    function captureSql() {
      const calls = prisma.$queryRaw.mock.calls;
      return {
        dataQuery: calls[0]?.[0] as SqlFragment | undefined,
        countQuery: calls[1]?.[0] as SqlFragment | undefined,
      };
    }

    it('uses pg_trgm similarity via $queryRaw when query is ≥2 chars', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchMonsters({ q: 'drg' });

      expect(prisma.monster.findMany).not.toHaveBeenCalled();
      const { dataQuery, countQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"monsters"');
      expect(dataQuery?.sql).toContain('"contentSource"');
      expect(dataQuery?.values).toContain('srd');
      expect(dataQuery?.values).toContain('shared');
      expect(dataQuery?.sql).toContain('similarity');
      expect(dataQuery?.values).toContain('drg');
      expect(dataQuery?.values).toContain('%drg%');
      expect(countQuery?.sql).toContain('"monsters"');
    });

    it('falls back to legacy findMany substring path for single-char queries', async () => {
      prisma.monster.findMany.mockResolvedValue([]);
      prisma.monster.count.mockResolvedValue(0);

      await service.searchMonsters({ q: 'a' });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
          OR: [
            { name: { contains: 'a', mode: 'insensitive' } },
            { description: { contains: 'a', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('applies type/size/cr filters alongside fuzzy search SQL', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchMonsters({ q: 'drg', type: 'Dragon', size: 'Large', cr: '5' });

      const { dataQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"type"');
      expect(dataQuery?.sql).toContain('"size"');
      expect(dataQuery?.sql).toContain('"challengeRating"');
      expect(dataQuery?.values).toContain('Dragon');
      expect(dataQuery?.values).toContain('Large');
      expect(dataQuery?.values).toContain(5);
    });

    it('applies minCr/maxCr range alongside fuzzy SQL', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchMonsters({ q: 'drg', minCr: '5', maxCr: '10' });

      const { dataQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"challengeRating" >=');
      expect(dataQuery?.sql).toContain('"challengeRating" <=');
      expect(dataQuery?.values).toContain(5);
      expect(dataQuery?.values).toContain(10);
    });

    it('applies parseFloat on cr filter', async () => {
      prisma.monster.findMany.mockResolvedValue([]);
      prisma.monster.count.mockResolvedValue(0);

      await service.searchMonsters({ cr: '0.25' });

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
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
          ...GLOBAL_WHERE,
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
          ...GLOBAL_WHERE,
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
    type SqlFragment = { sql: string; values: unknown[] };

    function captureSql() {
      const calls = prisma.$queryRaw.mock.calls;
      return {
        dataQuery: calls[0]?.[0] as SqlFragment | undefined,
        countQuery: calls[1]?.[0] as SqlFragment | undefined,
      };
    }

    it('uses pg_trgm similarity via $queryRaw when query is ≥2 chars', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchItems({ q: 'ptn' });

      expect(prisma.item.findMany).not.toHaveBeenCalled();
      const { dataQuery, countQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"items"');
      expect(dataQuery?.sql).toContain('"contentSource"');
      expect(dataQuery?.values).toContain('srd');
      expect(dataQuery?.values).toContain('shared');
      expect(dataQuery?.sql).toContain('similarity');
      expect(dataQuery?.values).toContain('ptn');
      expect(dataQuery?.values).toContain('%ptn%');
      expect(countQuery?.sql).toContain('"items"');
    });

    it('falls back to legacy findMany substring path for single-char queries', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.searchItems({ q: 'a' });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
          OR: [
            { name: { contains: 'a', mode: 'insensitive' } },
            { description: { contains: 'a', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('applies category/rarity/isMagic filters alongside fuzzy SQL', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.searchItems({ q: 'ptn', category: 'Potion', rarity: 'Rare', isMagic: 'true' });

      const { dataQuery } = captureSql();
      expect(dataQuery?.sql).toContain('"category"');
      expect(dataQuery?.sql).toContain('"rarity"');
      expect(dataQuery?.sql).toContain('"isMagic"');
      expect(dataQuery?.values).toContain('Potion');
      expect(dataQuery?.values).toContain('Rare');
      expect(dataQuery?.values).toContain(true);
    });

    it('adds category filter when provided', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.searchItems({ category: 'Potion' });

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          ...GLOBAL_WHERE,
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
          ...GLOBAL_WHERE,
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
          ...GLOBAL_WHERE,
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
        where: { ...GLOBAL_WHERE },
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
    it('returns spell by id, scoped to the global catalog', async () => {
      const spell = { id: '1', name: 'Fireball' };
      prisma.spell.findFirst.mockResolvedValue(spell);

      const result = await service.findSpell('1');

      expect(prisma.spell.findFirst).toHaveBeenCalledWith({ where: { id: '1', ...GLOBAL_WHERE } });
      expect(result).toEqual(spell);
    });
  });

  describe('findMonster', () => {
    it('returns monster by id, scoped to the global catalog', async () => {
      const monster = { id: '1', name: 'Dragon' };
      prisma.monster.findFirst.mockResolvedValue(monster);

      const result = await service.findMonster('1');

      expect(prisma.monster.findFirst).toHaveBeenCalledWith({
        where: { id: '1', ...GLOBAL_WHERE },
      });
      expect(result).toEqual(monster);
    });
  });

  describe('findItem', () => {
    it('returns item by id, scoped to the global catalog', async () => {
      const item = { id: '1', name: 'Healing Potion' };
      prisma.item.findFirst.mockResolvedValue(item);

      const result = await service.findItem('1');

      expect(prisma.item.findFirst).toHaveBeenCalledWith({ where: { id: '1', ...GLOBAL_WHERE } });
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
    it('returns feat by id, scoped to the global catalog', async () => {
      const feat = { id: '1', name: 'Tough' };
      prisma.feat.findFirst.mockResolvedValue(feat);

      const result = await service.findFeat('1');

      expect(prisma.feat.findFirst).toHaveBeenCalledWith({ where: { id: '1', ...GLOBAL_WHERE } });
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
    type SqlFragment = { sql: string; values: unknown[] };

    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.spell.findMany.mockResolvedValue([]);
      prisma.feat.findMany.mockResolvedValue([]);
      prisma.classFeature.findMany.mockResolvedValue([]);
      prisma.subclassFeature.findMany.mockResolvedValue([]);
      prisma.raceTrait.findMany.mockResolvedValue([]);
      prisma.backgroundFeature.findMany.mockResolvedValue([]);
    });

    function captureSql() {
      const calls = prisma.$queryRaw.mock.calls;
      return {
        idQuery: calls[0]?.[0] as SqlFragment | undefined,
        countQuery: calls[1]?.[0] as SqlFragment | undefined,
      };
    }

    function mockUnifiedQueryResults(idRows: { source: string; id: string }[], total: number) {
      prisma.$queryRaw.mockResolvedValueOnce(idRows).mockResolvedValueOnce([{ total }]);
    }

    it('runs UNION ALL across all six sources when types is unset', async () => {
      await service.search({});
      const { idQuery, countQuery } = captureSql();
      for (const table of [
        '"spells"',
        '"feats"',
        '"class_features"',
        '"subclass_features"',
        '"race_traits"',
        '"background_features"',
      ]) {
        expect(idQuery?.sql).toContain(table);
        expect(countQuery?.sql).toContain(table);
      }
      expect(idQuery?.sql).toContain('UNION ALL');
    });

    it('paginates in SQL via ORDER BY, LIMIT, and OFFSET (not in JS)', async () => {
      await service.search({ page: 3, limit: 10 });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('ORDER BY');
      expect(idQuery?.sql).toContain('LIMIT');
      expect(idQuery?.sql).toContain('OFFSET');
      expect(idQuery?.values).toContain(10);
      expect(idQuery?.values).toContain(20);
    });

    it('only includes the spell source when types=["spell"]', async () => {
      await service.search({ types: ['spell'] });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"spells"');
      expect(idQuery?.sql).not.toContain('"feats"');
      expect(idQuery?.sql).not.toContain('"class_features"');
      expect(idQuery?.sql).not.toContain('"subclass_features"');
      expect(idQuery?.sql).not.toContain('"race_traits"');
      expect(idQuery?.sql).not.toContain('"background_features"');
    });

    it('only includes the feat source when types=["feat"]', async () => {
      await service.search({ types: ['feat'] });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"feats"');
      expect(idQuery?.sql).not.toContain('"spells"');
      expect(idQuery?.sql).not.toContain('"class_features"');
    });

    it('only includes the four feature tables when types=["feature"]', async () => {
      await service.search({ types: ['feature'] });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).not.toContain('"spells"');
      expect(idQuery?.sql).not.toContain('"feats"');
      expect(idQuery?.sql).toContain('"class_features"');
      expect(idQuery?.sql).toContain('"subclass_features"');
      expect(idQuery?.sql).toContain('"race_traits"');
      expect(idQuery?.sql).toContain('"background_features"');
    });

    it('applies q as ILIKE on name and description in every enabled source', async () => {
      await service.search({ q: 'fire' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('ILIKE');
      const wildcardMatches = idQuery?.values.filter(v => v === '%fire%') ?? [];
      // 6 sources × 2 columns (name + description) per source.
      expect(wildcardMatches.length).toBe(12);
    });

    it('restricts the spell and feat sources to the global catalog (srd + shared)', async () => {
      await service.search({ types: ['spell', 'feat'] });
      const { idQuery, countQuery } = captureSql();
      expect(idQuery?.sql).toContain('"contentSource"');
      expect(countQuery?.sql).toContain('"contentSource"');
      // Both content sources (spell + feat) contribute the srd/shared params.
      expect(idQuery?.values.filter(v => v === 'srd').length).toBe(2);
      expect(idQuery?.values.filter(v => v === 'shared').length).toBe(2);
    });

    it('applies spell sub-filters (class via ANY, level, school)', async () => {
      await service.search({
        types: ['spell'],
        class: 'Wizard',
        level: 3,
        school: 'Evocation',
      });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toMatch(/ANY\s*\(\s*"classes"\s*\)/);
      expect(idQuery?.values).toContain('Wizard');
      expect(idQuery?.values).toContain(3);
      expect(idQuery?.values).toContain('Evocation');
    });

    it('applies hasPrerequisite=true as IS NOT NULL', async () => {
      await service.search({ types: ['feat'], hasPrerequisite: 'true' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"prerequisite" IS NOT NULL');
    });

    it('applies hasPrerequisite=false as IS NULL', async () => {
      await service.search({ types: ['feat'], hasPrerequisite: 'false' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"prerequisite" IS NULL');
    });

    it('applies feat category filter as a parameterized value', async () => {
      await service.search({ types: ['feat'], category: 'Origin' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"category"');
      expect(idQuery?.values).toContain('Origin');
    });

    it('applies feat repeatable=true filter', async () => {
      await service.search({ types: ['feat'], repeatable: 'true' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"repeatable" = TRUE');
    });

    it('applies feat repeatable=false filter', async () => {
      await service.search({ types: ['feat'], repeatable: 'false' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"repeatable" = FALSE');
    });

    it('restricts feature sources to the requested parentType', async () => {
      await service.search({ types: ['feature'], parentType: 'class' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"class_features"');
      expect(idQuery?.sql).not.toContain('"subclass_features"');
      expect(idQuery?.sql).not.toContain('"race_traits"');
      expect(idQuery?.sql).not.toContain('"background_features"');
    });

    it('applies parentId on the matching parent FK column', async () => {
      await service.search({ types: ['feature'], parentType: 'class', parentId: 'cls-1' });
      const { idQuery } = captureSql();
      expect(idQuery?.sql).toContain('"classId"');
      expect(idQuery?.values).toContain('cls-1');
    });

    it('hydrates spell hits via findMany with id IN page IDs', async () => {
      mockUnifiedQueryResults([{ source: 'spell', id: 'sp-1' }], 1);
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

      const result = await service.search({ types: ['spell'] });

      expect(prisma.spell.findMany).toHaveBeenCalledWith({ where: { id: { in: ['sp-1'] } } });
      expect(result.data[0]).toEqual({ kind: 'spell', data: fullSpell });
      expect(result.total).toBe(1);
    });

    it('hydrates feat hits via findMany with id IN page IDs', async () => {
      mockUnifiedQueryResults([{ source: 'feat', id: 'feat-1' }], 1);
      const fullFeat = {
        id: 'feat-1',
        name: 'Sharpshooter',
        prerequisite: null,
        description: 'You have mastered ranged weapons.',
        benefits: ['No long-range disadvantage'],
        category: 'General',
        repeatable: false,
        source: 'SRD 5.2.1',
      };
      prisma.feat.findMany.mockResolvedValue([fullFeat]);

      const result = await service.search({ types: ['feat'] });

      expect(prisma.feat.findMany).toHaveBeenCalledWith({ where: { id: { in: ['feat-1'] } } });
      expect(result.data[0]).toEqual({ kind: 'feat', data: fullFeat });
    });

    it('hydrates class-feature hits with parent metadata', async () => {
      mockUnifiedQueryResults([{ source: 'feature:class', id: 'cf-1' }], 1);
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

      const result = await service.search({ types: ['feature'], parentType: 'class' });

      expect(prisma.classFeature.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['cf-1'] } },
        include: { class: { select: { id: true, name: true } } },
      });
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

    it('returns total from the SQL count query (not from row counts)', async () => {
      mockUnifiedQueryResults([{ source: 'spell', id: 'sp-1' }], 42);
      prisma.spell.findMany.mockResolvedValue([
        {
          id: 'sp-1',
          name: 'X',
          level: 0,
          school: '',
          castingTime: '',
          range: '',
          components: '',
          duration: '',
          description: '',
          classes: [],
          ritual: false,
          concentration: false,
          material: null,
          higherLevels: null,
          source: '',
        },
      ]);

      const result = await service.search({});

      expect(result.total).toBe(42);
      expect(result.lastPage).toBe(Math.ceil(42 / 20));
    });

    it('preserves SQL-given page order across kinds in the response', async () => {
      mockUnifiedQueryResults(
        [
          { source: 'feat', id: 'feat-1' },
          { source: 'spell', id: 'sp-1' },
          { source: 'feature:class', id: 'cf-1' },
        ],
        3
      );
      prisma.spell.findMany.mockResolvedValue([
        {
          id: 'sp-1',
          name: 'Bless',
          level: 1,
          school: '',
          castingTime: '',
          range: '',
          components: '',
          duration: '',
          description: '',
          classes: [],
          ritual: false,
          concentration: false,
          material: null,
          higherLevels: null,
          source: '',
        },
      ]);
      prisma.feat.findMany.mockResolvedValue([
        {
          id: 'feat-1',
          name: 'Alert',
          prerequisite: null,
          description: '',
          benefits: null,
          category: null,
          repeatable: false,
          source: '',
        },
      ]);
      prisma.classFeature.findMany.mockResolvedValue([
        {
          id: 'cf-1',
          name: 'Cunning Action',
          level: 2,
          description: '',
          classId: 'cls-1',
          class: { id: 'cls-1', name: 'Rogue' },
        },
      ]);

      const result = await service.search({});

      expect(result.data.map(h => (h.data as { name: string }).name)).toEqual([
        'Alert',
        'Bless',
        'Cunning Action',
      ]);
    });
  });

  describe('invalidateCache', () => {
    it('calls clear() on the injected cache manager', async () => {
      await service.invalidateCache();
      expect(cache.clear).toHaveBeenCalledTimes(1);
    });
  });

  // ── findFeaturesByIds (unified feature hydration) ────

  describe('findFeaturesByIds', () => {
    beforeEach(() => {
      prisma.classFeature.findMany.mockResolvedValue([]);
      prisma.subclassFeature.findMany.mockResolvedValue([]);
      prisma.raceTrait.findMany.mockResolvedValue([]);
      prisma.backgroundFeature.findMany.mockResolvedValue([]);
    });

    it('returns an empty array for empty input without querying', async () => {
      const result = await service.findFeaturesByIds([]);

      expect(result).toEqual([]);
      expect(prisma.classFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.subclassFeature.findMany).not.toHaveBeenCalled();
      expect(prisma.raceTrait.findMany).not.toHaveBeenCalled();
      expect(prisma.backgroundFeature.findMany).not.toHaveBeenCalled();
    });

    it('resolves ids across all four feature tables into UnifiedFeatureData', async () => {
      prisma.classFeature.findMany.mockResolvedValue([
        {
          id: 'cf-1',
          name: 'Action Surge',
          level: 2,
          description: 'Extra action.',
          classId: 'cls-1',
          class: { id: 'cls-1', name: 'Fighter' },
        },
      ]);
      prisma.subclassFeature.findMany.mockResolvedValue([
        {
          id: 'scf-1',
          name: 'Combat Superiority',
          level: 3,
          description: 'Maneuvers.',
          subclassId: 'sc-1',
          subclass: { id: 'sc-1', name: 'Battle Master' },
        },
      ]);
      prisma.raceTrait.findMany.mockResolvedValue([
        {
          id: 'rt-1',
          name: 'Darkvision',
          description: 'See in dim light.',
          raceId: 'r-1',
          race: { id: 'r-1', name: 'Elf' },
        },
      ]);
      prisma.backgroundFeature.findMany.mockResolvedValue([
        {
          id: 'bf-1',
          name: 'Shelter of the Faithful',
          description: 'Temple aid.',
          backgroundId: 'b-1',
          background: { id: 'b-1', name: 'Acolyte' },
        },
      ]);

      const ids = ['cf-1', 'scf-1', 'rt-1', 'bf-1'];
      const result = await service.findFeaturesByIds(ids);

      expect(prisma.classFeature.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ids } } })
      );
      expect(prisma.subclassFeature.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ids } } })
      );
      expect(prisma.raceTrait.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ids } } })
      );
      expect(prisma.backgroundFeature.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ids } } })
      );

      expect(result).toEqual([
        {
          id: 'cf-1',
          name: 'Action Surge',
          level: 2,
          description: 'Extra action.',
          parent: { kind: 'class', id: 'cls-1', name: 'Fighter' },
        },
        {
          id: 'scf-1',
          name: 'Combat Superiority',
          level: 3,
          description: 'Maneuvers.',
          parent: { kind: 'subclass', id: 'sc-1', name: 'Battle Master' },
        },
        {
          id: 'rt-1',
          name: 'Darkvision',
          description: 'See in dim light.',
          parent: { kind: 'race', id: 'r-1', name: 'Elf' },
        },
        {
          id: 'bf-1',
          name: 'Shelter of the Faithful',
          description: 'Temple aid.',
          parent: { kind: 'background', id: 'b-1', name: 'Acolyte' },
        },
      ]);
    });

    it('omits level for race traits and background features', async () => {
      prisma.raceTrait.findMany.mockResolvedValue([
        {
          id: 'rt-1',
          name: 'Darkvision',
          description: 'd',
          raceId: 'r-1',
          race: { id: 'r-1', name: 'Elf' },
        },
      ]);

      const result = await service.findFeaturesByIds(['rt-1']);

      expect(result[0].level).toBeUndefined();
    });

    it('skips unknown ids without throwing', async () => {
      const result = await service.findFeaturesByIds(['nope']);
      expect(result).toEqual([]);
    });
  });
});
