import { Test, TestingModule } from '@nestjs/testing';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';

describe('SrdController', () => {
  let controller: SrdController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      searchSpells: jest.fn(),
      findSpell: jest.fn(),
      searchMonsters: jest.fn(),
      findMonster: jest.fn(),
      searchItems: jest.fn(),
      findItem: jest.fn(),
      findAllClasses: jest.fn(),
      findClass: jest.fn(),
      findAllRaces: jest.fn(),
      findRace: jest.fn(),
      searchSubclasses: jest.fn(),
      findSubclass: jest.fn(),
      searchSubraces: jest.fn(),
      findSubrace: jest.fn(),
      searchBackgrounds: jest.fn(),
      findBackground: jest.fn(),
      searchFeats: jest.fn(),
      findFeat: jest.fn(),
      findAllConditions: jest.fn(),
      findCondition: jest.fn(),
      searchSkills: jest.fn(),
      findSkill: jest.fn(),
      searchLanguages: jest.fn(),
      findLanguage: jest.fn(),
      findAllRules: jest.fn(),
      findRulesByCategory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SrdController],
      providers: [{ provide: SrdService, useValue: service }],
    }).compile();

    controller = module.get<SrdController>(SrdController);
  });

  // ── Spells ──────────────────────────────────────────

  describe('searchSpells', () => {
    it('delegates to service with query', async () => {
      const query = { q: 'fire' };
      service.searchSpells.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.searchSpells(query as any);

      expect(service.searchSpells).toHaveBeenCalledWith(query);
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('findSpell', () => {
    it('delegates to service with id', async () => {
      const spell = { id: '1', name: 'Fireball' };
      service.findSpell.mockResolvedValue(spell);

      const result = await controller.findSpell('1');

      expect(service.findSpell).toHaveBeenCalledWith('1');
      expect(result).toEqual(spell);
    });
  });

  // ── Monsters ────────────────────────────────────────

  describe('searchMonsters', () => {
    it('delegates to service with query', async () => {
      const query = { cr: '5' };
      service.searchMonsters.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.searchMonsters(query as any);

      expect(service.searchMonsters).toHaveBeenCalledWith(query);
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('findMonster', () => {
    it('delegates to service with id', async () => {
      const monster = { id: '1', name: 'Dragon' };
      service.findMonster.mockResolvedValue(monster);

      const result = await controller.findMonster('1');

      expect(service.findMonster).toHaveBeenCalledWith('1');
      expect(result).toEqual(monster);
    });
  });

  // ── Items ───────────────────────────────────────────

  describe('searchItems', () => {
    it('delegates to service with query', async () => {
      const query = { category: 'Potion' };
      service.searchItems.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.searchItems(query as any);

      expect(service.searchItems).toHaveBeenCalledWith(query);
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('findItem', () => {
    it('delegates to service with id', async () => {
      const item = { id: '1', name: 'Healing Potion' };
      service.findItem.mockResolvedValue(item);

      const result = await controller.findItem('1');

      expect(service.findItem).toHaveBeenCalledWith('1');
      expect(result).toEqual(item);
    });
  });

  // ── Classes ─────────────────────────────────────────

  describe('findAllClasses', () => {
    it('delegates to service', async () => {
      const classes = [{ id: '1', name: 'Fighter' }];
      service.findAllClasses.mockResolvedValue(classes);

      const result = await controller.findAllClasses();

      expect(service.findAllClasses).toHaveBeenCalled();
      expect(result).toEqual(classes);
    });
  });

  describe('findClass', () => {
    it('delegates to service with id', async () => {
      const cls = { id: '1', name: 'Fighter', subclasses: [] };
      service.findClass.mockResolvedValue(cls);

      const result = await controller.findClass('1');

      expect(service.findClass).toHaveBeenCalledWith('1');
      expect(result).toEqual(cls);
    });
  });

  // ── Races ───────────────────────────────────────────

  describe('findAllRaces', () => {
    it('delegates to service', async () => {
      const races = [{ id: '1', name: 'Elf' }];
      service.findAllRaces.mockResolvedValue(races);

      const result = await controller.findAllRaces();

      expect(service.findAllRaces).toHaveBeenCalled();
      expect(result).toEqual(races);
    });
  });

  describe('findRace', () => {
    it('delegates to service with id', async () => {
      const race = { id: '1', name: 'Elf', subraces: [] };
      service.findRace.mockResolvedValue(race);

      const result = await controller.findRace('1');

      expect(service.findRace).toHaveBeenCalledWith('1');
      expect(result).toEqual(race);
    });
  });

  // ── Subclasses ──────────────────────────────────────

  describe('searchSubclasses', () => {
    it('delegates to service with classId', async () => {
      service.searchSubclasses.mockResolvedValue([]);

      const result = await controller.searchSubclasses('class-1');

      expect(service.searchSubclasses).toHaveBeenCalledWith('class-1');
      expect(result).toEqual([]);
    });
  });

  describe('findSubclass', () => {
    it('delegates to service with id', async () => {
      const subclass = { id: '1', name: 'Champion' };
      service.findSubclass.mockResolvedValue(subclass);

      const result = await controller.findSubclass('1');

      expect(service.findSubclass).toHaveBeenCalledWith('1');
      expect(result).toEqual(subclass);
    });
  });

  // ── Subraces ────────────────────────────────────────

  describe('searchSubraces', () => {
    it('delegates to service with raceId', async () => {
      service.searchSubraces.mockResolvedValue([]);

      const result = await controller.searchSubraces('race-1');

      expect(service.searchSubraces).toHaveBeenCalledWith('race-1');
      expect(result).toEqual([]);
    });
  });

  describe('findSubrace', () => {
    it('delegates to service with id', async () => {
      const subrace = { id: '1', name: 'High Elf' };
      service.findSubrace.mockResolvedValue(subrace);

      const result = await controller.findSubrace('1');

      expect(service.findSubrace).toHaveBeenCalledWith('1');
      expect(result).toEqual(subrace);
    });
  });

  // ── Backgrounds ─────────────────────────────────────

  describe('searchBackgrounds', () => {
    it('delegates to service with query', async () => {
      service.searchBackgrounds.mockResolvedValue([]);

      const result = await controller.searchBackgrounds('noble');

      expect(service.searchBackgrounds).toHaveBeenCalledWith('noble');
      expect(result).toEqual([]);
    });
  });

  describe('findBackground', () => {
    it('delegates to service with id', async () => {
      const bg = { id: '1', name: 'Noble' };
      service.findBackground.mockResolvedValue(bg);

      const result = await controller.findBackground('1');

      expect(service.findBackground).toHaveBeenCalledWith('1');
      expect(result).toEqual(bg);
    });
  });

  // ── Feats ───────────────────────────────────────────

  describe('searchFeats', () => {
    it('delegates to service with query', async () => {
      service.searchFeats.mockResolvedValue([]);

      const result = await controller.searchFeats('tough');

      expect(service.searchFeats).toHaveBeenCalledWith('tough');
      expect(result).toEqual([]);
    });
  });

  describe('findFeat', () => {
    it('delegates to service with id', async () => {
      const feat = { id: '1', name: 'Tough' };
      service.findFeat.mockResolvedValue(feat);

      const result = await controller.findFeat('1');

      expect(service.findFeat).toHaveBeenCalledWith('1');
      expect(result).toEqual(feat);
    });
  });

  // ── Conditions ──────────────────────────────────────

  describe('findAllConditions', () => {
    it('delegates to service', async () => {
      const conditions = [{ id: '1', name: 'Blinded' }];
      service.findAllConditions.mockResolvedValue(conditions);

      const result = await controller.findAllConditions();

      expect(service.findAllConditions).toHaveBeenCalled();
      expect(result).toEqual(conditions);
    });
  });

  describe('findCondition', () => {
    it('delegates to service with id', async () => {
      const condition = { id: '1', name: 'Blinded' };
      service.findCondition.mockResolvedValue(condition);

      const result = await controller.findCondition('1');

      expect(service.findCondition).toHaveBeenCalledWith('1');
      expect(result).toEqual(condition);
    });
  });

  // ── Skills ──────────────────────────────────────────

  describe('searchSkills', () => {
    it('delegates to service with ability', async () => {
      service.searchSkills.mockResolvedValue([]);

      const result = await controller.searchSkills('Dexterity');

      expect(service.searchSkills).toHaveBeenCalledWith('Dexterity');
      expect(result).toEqual([]);
    });
  });

  describe('findSkill', () => {
    it('delegates to service with id', async () => {
      const skill = { id: '1', name: 'Acrobatics' };
      service.findSkill.mockResolvedValue(skill);

      const result = await controller.findSkill('1');

      expect(service.findSkill).toHaveBeenCalledWith('1');
      expect(result).toEqual(skill);
    });
  });

  // ── Languages ───────────────────────────────────────

  describe('searchLanguages', () => {
    it('delegates to service with type', async () => {
      service.searchLanguages.mockResolvedValue([]);

      const result = await controller.searchLanguages('Standard');

      expect(service.searchLanguages).toHaveBeenCalledWith('Standard');
      expect(result).toEqual([]);
    });
  });

  describe('findLanguage', () => {
    it('delegates to service with id', async () => {
      const lang = { id: '1', name: 'Common' };
      service.findLanguage.mockResolvedValue(lang);

      const result = await controller.findLanguage('1');

      expect(service.findLanguage).toHaveBeenCalledWith('1');
      expect(result).toEqual(lang);
    });
  });

  // ── Game Rules ─────────────────────────────────────

  describe('findAllRules', () => {
    it('delegates to service', async () => {
      const rules = [{ id: '1', category: 'hp', key: 'formula' }];
      service.findAllRules.mockResolvedValue(rules);

      const result = await controller.findAllRules();

      expect(service.findAllRules).toHaveBeenCalled();
      expect(result).toEqual(rules);
    });
  });

  describe('findRulesByCategory', () => {
    it('delegates to service with category', async () => {
      const rules = [{ id: '1', category: 'hp', key: 'formula' }];
      service.findRulesByCategory.mockResolvedValue(rules);

      const result = await controller.findRulesByCategory('hp');

      expect(service.findRulesByCategory).toHaveBeenCalledWith('hp');
      expect(result).toEqual(rules);
    });
  });
});
