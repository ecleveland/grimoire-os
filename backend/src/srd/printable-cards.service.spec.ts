import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PRINTABLE_CARD_BATCH_MAX } from '@grimoire-os/shared';
import { PrintableCardsService } from './printable-cards.service';
import { SrdService } from './srd.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';

const MONSTER_ROW = {
  id: 'mon-1',
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  alignment: 'neutral evil',
  challengeRating: 0.25,
  experiencePoints: 50,
  armorClass: 15,
  hitPoints: 7,
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  actions: [
    { name: 'Scimitar', description: 'Melee weapon attack.' },
    { name: 'Shortbow', description: 'Ranged weapon attack.' },
  ],
  specialAbilities: [
    { name: 'Nimble Escape', description: 'Disengage or Hide as a bonus action.' },
  ],
};

const SPELL_ROW = {
  id: 'sp-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  description: 'A bright streak flashes...',
};

const ITEM_ROW = {
  id: 'it-1',
  name: 'Bag of Holding',
  category: 'Wondrous item',
  rarity: 'Uncommon',
  requiresAttunement: false,
  properties: ['magic'],
  description: 'This bag has an interior space...',
};

const RACE_ROW = {
  id: 'race-1',
  name: 'Dwarf',
  traits: [
    { name: 'Darkvision', description: 'See in dim light.' },
    { name: 'Dwarven Resilience', description: 'Advantage vs poison.' },
  ],
};

const BACKGROUND_ROW = {
  id: 'bg-1',
  name: 'Acolyte',
  features: [{ name: 'Shelter of the Faithful', description: 'Receive aid at temples.' }],
};

const FEATURE_DATA = {
  id: 'feat-1',
  name: 'Action Surge',
  level: 2,
  description: 'Take one additional action.',
  parent: { kind: 'class' as const, id: 'cls-1', name: 'Fighter' },
};

// The real-world VEG-276 case: the seeded Draconic Ancestry trait carries the
// GFM table the loader appends for the races UI (VEG-273). Print cards render
// plain text, so the producer must drop the table (title included) and keep
// the prose, which already points at the table by name.
const DRACONIC_ANCESTRY_DESCRIPTION =
  'Your lineage stems from a dragon progenitor. Choose the kind of dragon from the Draconic Ancestors table. Your choice affects your Breath Weapon and Damage Resistance traits as well as your appearance.\n\n' +
  '**Draconic Ancestors**\n\n' +
  '| Dragon | Damage Type |\n| --- | --- |\n| Black | Acid |\n| Blue | Lightning |\n| Brass | Fire |';

const DRACONIC_ANCESTRY_FLATTENED =
  'Your lineage stems from a dragon progenitor. Choose the kind of dragon from the Draconic Ancestors table. Your choice affects your Breath Weapon and Damage Resistance traits as well as your appearance.';

describe('PrintableCardsService', () => {
  let service: PrintableCardsService;
  let prisma: MockPrismaService;
  let srdService: { findFeaturesByIds: jest.Mock };

  beforeEach(async () => {
    srdService = { findFeaturesByIds: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrintableCardsService,
        prismaMockProvider(),
        { provide: SrdService, useValue: srdService },
      ],
    }).compile();

    service = module.get<PrintableCardsService>(PrintableCardsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);

    prisma.monster.findMany.mockResolvedValue([]);
    prisma.spell.findMany.mockResolvedValue([]);
    prisma.item.findMany.mockResolvedValue([]);
    prisma.race.findMany.mockResolvedValue([]);
    prisma.background.findMany.mockResolvedValue([]);
  });

  it('returns empty groups for an empty selection', async () => {
    const result = await service.hydrate([]);
    expect(result).toEqual({ groups: [] });
    expect(prisma.monster.findMany).not.toHaveBeenCalled();
  });

  it('hydrates a mixed-type batch into groups in first-appearance request order', async () => {
    prisma.monster.findMany.mockResolvedValue([MONSTER_ROW]);
    prisma.spell.findMany.mockResolvedValue([SPELL_ROW]);
    srdService.findFeaturesByIds.mockResolvedValue([FEATURE_DATA]);

    const result = await service.hydrate([
      { type: 'monster', ids: ['mon-1'] },
      { type: 'spell', ids: ['sp-1'] },
      { type: 'feature', ids: ['feat-1'] },
    ]);

    expect(result.groups.map(g => g.type)).toEqual(['monster', 'spell', 'feature']);
    expect(result.groups[0].cards).toHaveLength(1);
    expect(result.groups[1].cards).toHaveLength(1);
    expect(result.groups[2].cards).toHaveLength(1);
  });

  describe('monster cards', () => {
    it('projects the curated monster fields', async () => {
      prisma.monster.findMany.mockResolvedValue([MONSTER_ROW]);

      const result = await service.hydrate([{ type: 'monster', ids: ['mon-1'] }]);

      expect(result.groups[0].cards[0]).toEqual({
        type: 'monster',
        id: 'mon-1',
        name: 'Goblin',
        size: 'Small',
        creatureType: 'humanoid',
        alignment: 'neutral evil',
        challengeRating: 0.25,
        experiencePoints: 50,
        armorClass: 15,
        hitPoints: 7,
        speed: '30 ft.',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        actions: [
          { name: 'Scimitar', description: 'Melee weapon attack.' },
          { name: 'Shortbow', description: 'Ranged weapon attack.' },
        ],
        traits: [{ name: 'Nimble Escape', description: 'Disengage or Hide as a bonus action.' }],
      });
    });

    it('caps actions at 4 and traits at 3', async () => {
      const entries = (n: number, prefix: string) =>
        Array.from({ length: n }, (_, i) => ({ name: `${prefix}-${i}`, description: 'd' }));
      prisma.monster.findMany.mockResolvedValue([
        { ...MONSTER_ROW, actions: entries(6, 'act'), specialAbilities: entries(5, 'trait') },
      ]);

      const result = await service.hydrate([{ type: 'monster', ids: ['mon-1'] }]);

      const card = result.groups[0].cards[0] as {
        actions: unknown[];
        traits?: unknown[];
      };
      expect(card.actions).toHaveLength(4);
      expect(card.traits).toHaveLength(3);
    });

    it('omits traits when none, defaults null alignment, omits null XP', async () => {
      prisma.monster.findMany.mockResolvedValue([
        { ...MONSTER_ROW, specialAbilities: null, alignment: null, experiencePoints: null },
      ]);

      const result = await service.hydrate([{ type: 'monster', ids: ['mon-1'] }]);

      const card = result.groups[0].cards[0];
      expect(card).not.toHaveProperty('traits');
      expect(card).not.toHaveProperty('experiencePoints');
      expect(card).toMatchObject({ alignment: 'unaligned' });
    });

    it('drops malformed action entries from the JSON column', async () => {
      prisma.monster.findMany.mockResolvedValue([
        {
          ...MONSTER_ROW,
          actions: [{ name: 'Bite', description: 'Chomp.' }, { name: 'NoDesc' }, 'garbage', null],
        },
      ]);

      const result = await service.hydrate([{ type: 'monster', ids: ['mon-1'] }]);

      expect((result.groups[0].cards[0] as { actions: unknown[] }).actions).toEqual([
        { name: 'Bite', description: 'Chomp.' },
      ]);
    });
  });

  describe('spell cards', () => {
    it('projects the curated spell fields', async () => {
      prisma.spell.findMany.mockResolvedValue([SPELL_ROW]);

      const result = await service.hydrate([{ type: 'spell', ids: ['sp-1'] }]);

      expect(result.groups[0].cards[0]).toEqual({
        type: 'spell',
        id: 'sp-1',
        name: 'Fireball',
        level: 3,
        school: 'Evocation',
        castingTime: '1 action',
        range: '150 feet',
        components: 'V, S, M',
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        description: 'A bright streak flashes...',
      });
    });
  });

  describe('item cards', () => {
    it('projects the curated item fields', async () => {
      prisma.item.findMany.mockResolvedValue([ITEM_ROW]);

      const result = await service.hydrate([{ type: 'item', ids: ['it-1'] }]);

      expect(result.groups[0].cards[0]).toEqual({
        type: 'item',
        id: 'it-1',
        name: 'Bag of Holding',
        category: 'Wondrous item',
        rarity: 'Uncommon',
        requiresAttunement: false,
        properties: ['magic'],
        description: 'This bag has an interior space...',
      });
    });

    it('omits null rarity and description', async () => {
      prisma.item.findMany.mockResolvedValue([{ ...ITEM_ROW, rarity: null, description: null }]);

      const result = await service.hydrate([{ type: 'item', ids: ['it-1'] }]);

      const card = result.groups[0].cards[0];
      expect(card).not.toHaveProperty('rarity');
      expect(card).not.toHaveProperty('description');
    });
  });

  describe('race and species cards', () => {
    it('hydrates race cards from the races table with traits capped at 4', async () => {
      const traits = Array.from({ length: 6 }, (_, i) => ({
        name: `Trait ${i}`,
        description: 'd',
      }));
      prisma.race.findMany.mockResolvedValue([{ ...RACE_ROW, traits }]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      const card = result.groups[0].cards[0] as { type: string; traits: unknown[] };
      expect(card.type).toBe('race');
      expect(card.traits).toHaveLength(4);
    });

    it('hydrates species cards from the races table tagged as species', async () => {
      prisma.race.findMany.mockResolvedValue([RACE_ROW]);

      const result = await service.hydrate([{ type: 'species', ids: ['race-1'] }]);

      expect(result.groups[0]).toEqual({
        type: 'species',
        cards: [
          {
            type: 'species',
            id: 'race-1',
            name: 'Dwarf',
            traits: [
              { name: 'Darkvision', description: 'See in dim light.' },
              { name: 'Dwarven Resilience', description: 'Advantage vs poison.' },
            ],
          },
        ],
      });
    });
  });

  describe('background cards', () => {
    it('maps background features to trait entries capped at 4', async () => {
      const features = Array.from({ length: 5 }, (_, i) => ({
        name: `Feature ${i}`,
        description: 'd',
      }));
      prisma.background.findMany.mockResolvedValue([{ ...BACKGROUND_ROW, features }]);

      const result = await service.hydrate([{ type: 'background', ids: ['bg-1'] }]);

      const card = result.groups[0].cards[0] as { type: string; traits: unknown[] };
      expect(card.type).toBe('background');
      expect(card.traits).toHaveLength(4);
    });
  });

  describe('feature cards', () => {
    it('resolves feature ids through the unified feature layer', async () => {
      srdService.findFeaturesByIds.mockResolvedValue([FEATURE_DATA]);

      const result = await service.hydrate([{ type: 'feature', ids: ['feat-1'] }]);

      expect(srdService.findFeaturesByIds).toHaveBeenCalledWith(['feat-1']);
      expect(result.groups[0].cards[0]).toEqual({
        type: 'feature',
        id: 'feat-1',
        name: 'Action Surge',
        parent: { kind: 'class', id: 'cls-1', name: 'Fighter' },
        level: 2,
        description: 'Take one additional action.',
      });
    });

    it('omits level for level-less features (race/background)', async () => {
      srdService.findFeaturesByIds.mockResolvedValue([
        { ...FEATURE_DATA, level: undefined, parent: { kind: 'race', id: 'r1', name: 'Elf' } },
      ]);

      const result = await service.hydrate([{ type: 'feature', ids: ['feat-1'] }]);

      expect(result.groups[0].cards[0]).not.toHaveProperty('level');
    });
  });

  describe('markdown flattening (VEG-276)', () => {
    const raceWithTrait = (description: string) => ({
      ...RACE_ROW,
      traits: [{ name: 'Draconic Ancestry', description }],
    });
    const firstTraitDescription = (result: { groups: { cards: unknown[] }[] }) =>
      (result.groups[0].cards[0] as { traits: { description: string }[] }).traits[0].description;

    it('drops a GFM pipe table (and its bold title) from a race trait, keeping the prose', async () => {
      prisma.race.findMany.mockResolvedValue([raceWithTrait(DRACONIC_ANCESTRY_DESCRIPTION)]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      const description = firstTraitDescription(result);
      expect(description).toBe(DRACONIC_ANCESTRY_FLATTENED);
      expect(description).not.toContain('**');
      expect(description).not.toContain('|');
      expect(description).not.toContain('---');
    });

    it('strips emphasis markers from trait descriptions', async () => {
      prisma.race.findMany.mockResolvedValue([
        raceWithTrait('You gain **Heroic Inspiration** and *advantage* on _initiative_ rolls.'),
      ]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      expect(firstTraitDescription(result)).toBe(
        'You gain Heroic Inspiration and advantage on initiative rolls.'
      );
    });

    it('flattens option bullet lists into plain sentences', async () => {
      prisma.race.findMany.mockResolvedValue([
        raceWithTrait(
          'You have the following benefits:\n\n- **Adept.** You know a cantrip.\n- **Resilient.** You have advantage.'
        ),
      ]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      expect(firstTraitDescription(result)).toBe(
        'You have the following benefits: Adept. You know a cantrip. Resilient. You have advantage.'
      );
    });

    it('collapses whitespace runs so card text is a single compact line', async () => {
      prisma.race.findMany.mockResolvedValue([
        raceWithTrait('First sentence.\n\nSecond   sentence.\nThird.'),
      ]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      expect(firstTraitDescription(result)).toBe('First sentence. Second sentence. Third.');
    });

    it('flattens species trait descriptions (same source, species-tagged)', async () => {
      prisma.race.findMany.mockResolvedValue([raceWithTrait(DRACONIC_ANCESTRY_DESCRIPTION)]);

      const result = await service.hydrate([{ type: 'species', ids: ['race-1'] }]);

      expect(firstTraitDescription(result)).toBe(DRACONIC_ANCESTRY_FLATTENED);
    });

    it('flattens markdown tables in spell descriptions', async () => {
      prisma.spell.findMany.mockResolvedValue([
        {
          ...SPELL_ROW,
          description:
            'The GM chooses from the table below.\n\n| Omen | Result |\n| --- | --- |\n| Weal | Good |\n| Woe | Bad |',
        },
      ]);

      const result = await service.hydrate([{ type: 'spell', ids: ['sp-1'] }]);

      const card = result.groups[0].cards[0] as { description: string };
      expect(card.description).toBe('The GM chooses from the table below.');
    });

    it('flattens markdown tables and emphasis in item descriptions', async () => {
      prisma.item.findMany.mockResolvedValue([
        {
          ...ITEM_ROW,
          description:
            'This **magic** ammunition slays creatures.\n\n| d100 | Type |\n| --- | --- |\n| 01-10 | Beasts |',
        },
      ]);

      const result = await service.hydrate([{ type: 'item', ids: ['it-1'] }]);

      const card = result.groups[0].cards[0] as { description: string };
      expect(card.description).toBe('This magic ammunition slays creatures.');
    });

    it('flattens markdown in feature descriptions (race traits hydrate as features)', async () => {
      srdService.findFeaturesByIds.mockResolvedValue([
        {
          ...FEATURE_DATA,
          level: undefined,
          description: DRACONIC_ANCESTRY_DESCRIPTION,
          parent: { kind: 'race' as const, id: 'r1', name: 'Dragonborn' },
        },
      ]);

      const result = await service.hydrate([{ type: 'feature', ids: ['feat-1'] }]);

      const card = result.groups[0].cards[0] as { description: string };
      expect(card.description).toBe(DRACONIC_ANCESTRY_FLATTENED);
    });

    it('flattens markdown in background feature descriptions', async () => {
      prisma.background.findMany.mockResolvedValue([
        {
          ...BACKGROUND_ROW,
          features: [{ name: 'Patron', description: 'A **wealthy** patron sponsors you.' }],
        },
      ]);

      const result = await service.hydrate([{ type: 'background', ids: ['bg-1'] }]);

      expect(firstTraitDescription(result)).toBe('A wealthy patron sponsors you.');
    });

    it('flattens markdown in monster action and trait descriptions', async () => {
      prisma.monster.findMany.mockResolvedValue([
        {
          ...MONSTER_ROW,
          actions: [{ name: 'Bite', description: 'Deals **2d6** piercing damage.' }],
          specialAbilities: [{ name: 'Pack Tactics', description: 'Has *advantage* near allies.' }],
        },
      ]);

      const result = await service.hydrate([{ type: 'monster', ids: ['mon-1'] }]);

      const card = result.groups[0].cards[0] as {
        actions: { description: string }[];
        traits: { description: string }[];
      };
      expect(card.actions[0].description).toBe('Deals 2d6 piercing damage.');
      expect(card.traits[0].description).toBe('Has advantage near allies.');
    });

    it('leaves a stray non-emphasis asterisk or underscore untouched', async () => {
      prisma.race.findMany.mockResolvedValue([
        raceWithTrait('Rations last 7 days* under_score normal conditions.'),
      ]);

      const result = await service.hydrate([{ type: 'race', ids: ['race-1'] }]);

      expect(firstTraitDescription(result)).toBe(
        'Rations last 7 days* under_score normal conditions.'
      );
    });
  });

  describe('robustness', () => {
    it('silently drops unknown ids without failing the batch', async () => {
      prisma.spell.findMany.mockResolvedValue([SPELL_ROW]);

      const result = await service.hydrate([{ type: 'spell', ids: ['sp-1', 'nope'] }]);

      expect(result.groups[0].cards).toHaveLength(1);
      expect(result.groups[0].cards[0].id).toBe('sp-1');
    });

    it('returns cards in request id order regardless of DB row order', async () => {
      const second = { ...SPELL_ROW, id: 'sp-2', name: 'Aid' };
      prisma.spell.findMany.mockResolvedValue([second, SPELL_ROW]);

      const result = await service.hydrate([{ type: 'spell', ids: ['sp-1', 'sp-2'] }]);

      expect(result.groups[0].cards.map(c => c.id)).toEqual(['sp-1', 'sp-2']);
    });

    it('de-dupes repeated ids and merges duplicate type groups', async () => {
      prisma.spell.findMany.mockResolvedValue([SPELL_ROW]);

      const result = await service.hydrate([
        { type: 'spell', ids: ['sp-1', 'sp-1'] },
        { type: 'spell', ids: ['sp-1'] },
      ]);

      expect(prisma.spell.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.spell.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['sp-1'] } } })
      );
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].cards).toHaveLength(1);
    });

    it('rejects a batch above PRINTABLE_CARD_BATCH_MAX total ids', async () => {
      const ids = Array.from({ length: PRINTABLE_CARD_BATCH_MAX + 1 }, (_, i) => `id-${i}`);

      await expect(service.hydrate([{ type: 'spell', ids }])).rejects.toThrow(BadRequestException);
      expect(prisma.spell.findMany).not.toHaveBeenCalled();
    });

    it('accepts a batch of exactly PRINTABLE_CARD_BATCH_MAX ids', async () => {
      const ids = Array.from({ length: PRINTABLE_CARD_BATCH_MAX }, (_, i) => `id-${i}`);
      prisma.spell.findMany.mockResolvedValue([]);

      await expect(service.hydrate([{ type: 'spell', ids }])).resolves.toEqual({
        groups: [{ type: 'spell', cards: [] }],
      });
    });
  });
});
