// Real-DB regression tests for the two catalog reads VEG-537 scoped to the
// global tier. The unit specs mock Prisma, so they can prove each service
// *asks* for srd + shared but not that Postgres honours it. The tier model
// lives in the where clause, and a where clause is only tested by a database.
//
// The catalog is hand-built rather than seeded. Five rows are enough to
// exercise every branch of the suggestion query, and they never reach the
// per-category cap, so no assertion can pass or fail because of ordering.
import { BadRequestException } from '@nestjs/common';
import type { ShopLineItem } from '@grimoire-os/shared';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { ShopThemeService } from '../../src/shops/shop-theme.service';
import { AdminNpcDataService } from '../../src/admin/npc-data/admin-npc-data.service';

const POOL_NAME = 'Antitoxin'; // in the alchemist preset's curated pool
const PRIVATE_POTION = 'Aardvark Draught';
const SHARED_POTION = 'Aardvark Tonic';
const SRD_POTION = 'Elixir of Health';

describe('catalog-tier scoping on a real DB (VEG-537)', () => {
  let ctx: SeedContext;
  let authorId: string;
  let srdAntitoxinId: string;
  let srdPotionId: string;
  let sharedPotionId: string;
  let privatePotionId: string;
  let privateAntitoxinId: string;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    const author = await prisma.user.create({
      data: { username: `veg537-${Date.now()}`, passwordHash: 'x', displayName: 'Author' },
    });
    authorId = author.id;

    const homebrew = {
      contentSource: 'homebrew',
      createdById: authorId,
      source: 'Homebrew',
    } as const;
    const [srdAntitoxin, srdPotion, sharedPotion, privatePotion, privateAntitoxin] =
      await Promise.all([
        prisma.item.create({
          data: { name: POOL_NAME, category: 'Adventuring Gear', cost: '50 GP' },
        }),
        prisma.item.create({ data: { name: SRD_POTION, category: 'Potion', cost: '120 GP' } }),
        // Shared rows need no creator; the ownership CHECK constrains homebrew only.
        prisma.item.create({
          data: { name: SHARED_POTION, category: 'Potion', cost: '75 GP', contentSource: 'shared' },
        }),
        prisma.item.create({
          data: { name: PRIVATE_POTION, category: 'Potion', cost: '50 GP', ...homebrew },
        }),
        // Reuses the pool name. Legal under the per-tier partial unique index,
        // and exactly the collision that lets a name-keyed read pick the wrong row.
        prisma.item.create({
          data: { name: POOL_NAME, category: 'Adventuring Gear', cost: '1 GP', ...homebrew },
        }),
      ]);
    srdAntitoxinId = srdAntitoxin.id;
    srdPotionId = srdPotion.id;
    sharedPotionId = sharedPotion.id;
    privatePotionId = privatePotion.id;
    privateAntitoxinId = privateAntitoxin.id;
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('shop theme suggestions', () => {
    let lines: ShopLineItem[];

    beforeAll(async () => {
      // The real service with the real access helper, no Nest module, no mocks.
      // suggestStock is read-only, so one call serves every assertion.
      lines = await new ShopThemeService(ctx.prisma, new ContentAccessService()).suggestStock(
        'alchemist'
      );
    });

    it('never surfaces homebrew, whether matched by category or by pool name', () => {
      const ids = lines.map(line => line.itemId);
      expect(ids).not.toContain(privatePotionId);
      expect(ids).not.toContain(privateAntitoxinId);
    });

    it('resolves a pool name that collides with a homebrew row to the SRD row', () => {
      const matches = lines.filter(line => line.name === POOL_NAME);
      expect(matches).toHaveLength(1);
      expect(matches[0].itemId).toBe(srdAntitoxinId);
    });

    it('still reads the whole global catalog, SRD and admin-published shared rows alike', () => {
      const ids = lines.map(line => line.itemId);
      expect(ids).toContain(srdPotionId);
      expect(ids).toContain(sharedPotionId);
    });
  });

  describe('admin loot-template item names', () => {
    const template = (itemName: string) => ({
      profession: 'merchant',
      crBucket: '2\u20134',
      coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
      items: [{ itemName, weight: 1, qty: [1, 1] }],
    });

    it('rejects a name that resolves only to a homebrew row, even the caller\u2019s own', async () => {
      const service = new AdminNpcDataService(ctx.prisma, new ContentAccessService());

      const err = await service
        .create('loot-templates', authorId, template(PRIVATE_POTION))
        .catch(e => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(err.getResponse())).toContain('homebrew items are not eligible');
    });

    it('accepts a global name that a homebrew row also uses', async () => {
      const service = new AdminNpcDataService(ctx.prisma, new ContentAccessService());

      const row = await service.create('loot-templates', authorId, template(POOL_NAME));

      expect(row).toMatchObject({ category: 'npc', profession: 'merchant' });
    });
  });
});
