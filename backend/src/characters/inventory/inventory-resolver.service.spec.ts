import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryResolverService } from './inventory-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService, MockPrismaService } from '../../test/prisma-mock.factory';
import { RESOLVABLE_ITEM_SELECT } from './item-name-match';

const CHAIN_MAIL = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Chain Mail',
  category: 'Heavy Armor',
  armorClass: '16',
  damage: null,
  damageType: null,
  properties: [],
  stealthDisadvantage: true,
  strengthRequirement: 13,
};

const LONGSWORD = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Longsword',
  category: 'Martial Melee Weapon',
  armorClass: null,
  damage: '1d8',
  damageType: 'Slashing',
  properties: ['Versatile'],
  stealthDisadvantage: null,
  strengthRequirement: null,
};

const EXPLORERS_PACK = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Explorer’s Pack',
  category: 'Adventuring Gear',
  armorClass: null,
  damage: null,
  damageType: null,
  properties: [],
  stealthDisadvantage: null,
  strengthRequirement: null,
};

const CATALOG = [CHAIN_MAIL, LONGSWORD, EXPLORERS_PACK];

describe('InventoryResolverService', () => {
  let service: InventoryResolverService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.item.findMany.mockResolvedValue(CATALOG);

    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryResolverService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(InventoryResolverService);
  });

  const line = (over: Record<string, unknown> = {}) => ({
    name: 'Chain mail',
    quantity: 1,
    equipped: false,
    ...over,
  });

  describe('resolution', () => {
    it('attaches itemId and an armor snapshot to a seed-cased armor line', async () => {
      const [resolved] = await service.resolveInventory([line()]);

      expect(resolved.itemId).toBe(CHAIN_MAIL.id);
      expect(resolved.gear).toEqual({
        type: 'armor',
        armorType: 'heavy',
        baseArmorClass: 16,
        stealthDisadvantage: true,
        strengthRequirement: 13,
      });
    });

    it('attaches a weapon snapshot with its proficiency tier', async () => {
      const [resolved] = await service.resolveInventory([line({ name: 'Longsword' })]);

      expect(resolved.itemId).toBe(LONGSWORD.id);
      expect(resolved.gear).toEqual({
        type: 'weapon',
        damage: '1d8',
        damageType: 'Slashing',
        properties: ['Versatile'],
        ranged: false,
        weaponCategory: 'martial',
      });
    });

    it('links a non-gear item without inventing a gear key', async () => {
      const [resolved] = await service.resolveInventory([line({ name: "Explorer's pack" })]);

      expect(resolved.itemId).toBe(EXPLORERS_PACK.id);
      // Absent, not present-but-undefined: the line is persisted as JSON and
      // round-trips through a whitelist-validated DTO.
      expect('gear' in resolved).toBe(false);
    });

    it('leaves a placeholder line untouched', async () => {
      const placeholder = line({ name: 'Any martial melee weapon' });

      const [resolved] = await service.resolveInventory([placeholder]);

      expect(resolved).toEqual(placeholder);
      expect('itemId' in resolved).toBe(false);
    });

    it('preserves quantity, equipped and description', async () => {
      const [resolved] = await service.resolveInventory([
        line({ quantity: 3, equipped: true, description: 'heirloom' }),
      ]);

      expect(resolved).toMatchObject({ quantity: 3, equipped: true, description: 'heirloom' });
    });

    it('does not auto-equip resolved armor (VEG-462 ships picker parity)', async () => {
      const [resolved] = await service.resolveInventory([line()]);

      expect(resolved.equipped).toBe(false);
    });
  });

  describe('trust rule (VEG-410 snapshot preservation)', () => {
    const clientSnapshot = {
      type: 'armor' as const,
      armorType: 'light' as const,
      baseArmorClass: 11,
    };

    it('never overwrites a gear snapshot the client already sent', async () => {
      const [resolved] = await service.resolveInventory([line({ gear: clientSnapshot })]);

      expect(resolved.gear).toEqual(clientSnapshot);
    });

    it('preserves a client snapshot when a sibling line needs resolving', async () => {
      // The load-bearing case. A single snapshotted line short-circuits before
      // resolveLine runs, so the per-line guard is only actually exercised by a
      // MIXED array: the bare line flips needsResolution, routing the
      // snapshotted line through resolution too. Without the guard, this
      // picker-chosen AC 11 would be silently rewritten to the SRD's 16 —
      // exactly the VEG-410 contract this service claims to preserve.
      const [snapshotted, bare] = await service.resolveInventory([
        line({ gear: clientSnapshot }),
        line({ name: 'Longsword' }),
      ]);

      expect(snapshotted.gear).toEqual(clientSnapshot);
      expect(bare.gear).toMatchObject({ type: 'weapon', damage: '1d8' });
    });

    it('links a snapshotted line that arrived without an itemId', async () => {
      // Filling itemId destroys nothing, so it stays additive: the client's
      // snapshot is preserved while the line still gains its catalog link.
      const [resolved] = await service.resolveInventory([line({ gear: clientSnapshot })]);

      expect(resolved.gear).toEqual(clientSnapshot);
      expect(resolved.itemId).toBe(CHAIN_MAIL.id);
    });

    it('leaves a fully-resolved line alone', async () => {
      const [resolved] = await service.resolveInventory([
        line({ itemId: CHAIN_MAIL.id, gear: clientSnapshot }),
      ]);

      expect(resolved.gear).toEqual(clientSnapshot);
      expect(resolved.itemId).toBe(CHAIN_MAIL.id);
    });

    it('fills gear from the linked row when itemId is present but gear is not', async () => {
      // The id is authoritative over the name — a renamed-but-linked line
      // snapshots the row it points at, not whatever its label now reads.
      const [resolved] = await service.resolveInventory([
        line({ name: 'Grandfather’s mail', itemId: CHAIN_MAIL.id }),
      ]);

      expect(resolved.gear).toMatchObject({ type: 'armor', baseArmorClass: 16 });
      expect(resolved.itemId).toBe(CHAIN_MAIL.id);
    });

    it('passes through a line whose itemId is not an srd row', async () => {
      const homebrewLinked = line({
        name: 'Whatever',
        itemId: '99999999-9999-4999-8999-999999999999',
      });

      const [resolved] = await service.resolveInventory([homebrewLinked]);

      expect(resolved).toEqual(homebrewLinked);
    });

    it('round-trips an already-resolved line byte-identically', async () => {
      const [once] = await service.resolveInventory([line()]);
      const [twice] = await service.resolveInventory([once]);

      expect(twice).toEqual(once);
    });
  });

  describe('content tier scoping', () => {
    it('queries srd rows only', async () => {
      await service.resolveInventory([line()]);

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: { contentSource: 'srd' },
        select: RESOLVABLE_ITEM_SELECT,
      });
    });

    it('never binds a homebrew row that shares an srd name', async () => {
      // The srd-only query is the guard. If it ever widened, a user's homebrew
      // "Chain Mail" would silently snapshot into every character they build —
      // a user-dependent bug that reproduces for nobody else.
      const homebrew = { ...CHAIN_MAIL, id: 'homebrew-chain-mail', armorClass: '20' };
      prisma.item.findMany.mockResolvedValue([homebrew, CHAIN_MAIL]);

      const [resolved] = await service.resolveInventory([line()]);

      // Both rows normalize to the same name, so the index drops it entirely
      // rather than picking the homebrew AC 20.
      expect(resolved.gear).toBeUndefined();
    });
  });

  describe('catalog index caching', () => {
    it('queries the catalog once across calls', async () => {
      await service.resolveInventory([line()]);
      await service.resolveInventory([line({ name: 'Longsword' })]);

      expect(prisma.item.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not memoize an empty catalog', async () => {
      // A dev process booted before `npm run seed` would otherwise cache an
      // empty index for its whole lifetime and silently resolve nothing.
      prisma.item.findMany.mockResolvedValueOnce([]);

      await service.resolveInventory([line()]);
      const [resolved] = await service.resolveInventory([line()]);

      expect(prisma.item.findMany).toHaveBeenCalledTimes(2);
      expect(resolved.itemId).toBe(CHAIN_MAIL.id);
    });
  });

  describe('observability', () => {
    // These degradations are permanent: resolution runs only on create, so a
    // character built while the catalog is empty or a name is ambiguous stays
    // gear-less even after the underlying cause is fixed. Silent is not an
    // option; the operator needs a signal.
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    // Restored here rather than at the end of each test body, so a failing
    // assertion can't leak a silenced logger into unrelated suites.
    afterEach(() => warn.mockRestore());

    it('warns once when the srd catalog is empty', async () => {
      prisma.item.findMany.mockResolvedValue([]);

      await service.resolveInventory([line()]);
      await service.resolveInventory([line()]);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/catalog is empty/i);
    });

    it('warns when a name is dropped as ambiguous', async () => {
      prisma.item.findMany.mockResolvedValue([CHAIN_MAIL, { ...CHAIN_MAIL, id: 'other' }]);

      await service.resolveInventory([line()]);

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ambiguous srd item name/i));
    });
  });

  describe('short-circuits', () => {
    it('does not query for an empty inventory', async () => {
      expect(await service.resolveInventory([])).toEqual([]);
      expect(prisma.item.findMany).not.toHaveBeenCalled();
    });

    it('does not query when every line is already fully resolved', async () => {
      await service.resolveInventory([
        line({
          itemId: CHAIN_MAIL.id,
          gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 },
        }),
      ]);

      expect(prisma.item.findMany).not.toHaveBeenCalled();
    });

    it('still queries when a line has gear but no catalog link', async () => {
      await service.resolveInventory([
        line({ gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 } }),
      ]);

      expect(prisma.item.findMany).toHaveBeenCalled();
    });
  });
});
