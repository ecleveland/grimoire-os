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
    it('returns all classes ordered by name', async () => {
      const classes = [{ id: '1', name: 'Fighter' }];
      prisma.srdClass.findMany.mockResolvedValue(classes);

      const result = await service.findAllClasses();

      expect(prisma.srdClass.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(classes);
    });
  });

  describe('findClass', () => {
    it('includes subclasses relation', async () => {
      prisma.srdClass.findUnique.mockResolvedValue({
        id: '1',
        name: 'Fighter',
        subclasses: [],
      });

      await service.findClass('1');

      expect(prisma.srdClass.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { subclasses: true },
      });
    });
  });

  // ── Races ───────────────────────────────────────────

  describe('findAllRaces', () => {
    it('returns all races ordered by name', async () => {
      const races = [{ id: '1', name: 'Elf' }];
      prisma.race.findMany.mockResolvedValue(races);

      const result = await service.findAllRaces();

      expect(prisma.race.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(races);
    });
  });

  describe('findRace', () => {
    it('includes subraces relation', async () => {
      prisma.race.findUnique.mockResolvedValue({
        id: '1',
        name: 'Elf',
        subraces: [],
      });

      await service.findRace('1');

      expect(prisma.race.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: { subraces: true },
      });
    });
  });

  // ── Subclasses ──────────────────────────────────────

  describe('searchSubclasses', () => {
    it('passes empty where when no filter', async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses();

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });

    it('filters by classId', async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses('class-1');

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: { classId: 'class-1' },
        orderBy: { name: 'asc' },
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
    it('returns subclass by id', async () => {
      const subclass = { id: '1', name: 'Champion' };
      prisma.subclass.findUnique.mockResolvedValue(subclass);

      const result = await service.findSubclass('1');

      expect(prisma.subclass.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
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
    it('returns background by id', async () => {
      const bg = { id: '1', name: 'Noble' };
      prisma.background.findUnique.mockResolvedValue(bg);

      const result = await service.findBackground('1');

      expect(prisma.background.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
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
});
