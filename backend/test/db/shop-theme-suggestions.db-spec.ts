// Real-DB regression test for the shop theme suggestion leak (VEG-537).
//
// shop-theme.service.spec.ts mocks Prisma, so it can prove the service *asks*
// for the global tier but not that Postgres honours it. The tier model lives in
// the where clause, and a where clause is only tested by a database. This is the
// spec that goes red if the scoping is ever dropped again.
//
// Fixture names sort before every SRD potion on purpose: the resolver caps
// category matches per category, so a fixture that sorted past the cap would be
// excluded by the cap, not by the scoping, and the negative assertion would pass
// for the wrong reason.
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import type { ShopLineItem } from '@grimoire-os/shared';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { ShopThemeService } from '../../src/shops/shop-theme.service';

const PRIVATE_POTION = 'Aardvark Draught';
const SHARED_POTION = 'Aardvark Tonic';
const POOL_NAME = 'Antitoxin'; // in the alchemist preset's curated pool

describe('shop theme suggestions on a real DB (VEG-537)', () => {
  let ctx: SeedContext;
  let lines: ShopLineItem[];
  let srdAntitoxinId: string;
  let privatePotionId: string;
  let privateAntitoxinId: string;
  let sharedPotionId: string;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma, seed } = ctx;

    await truncateAll(prisma);
    await seed.seed();

    const srdAntitoxin = await prisma.item.findFirstOrThrow({
      where: { name: POOL_NAME, contentSource: 'srd' },
    });
    srdAntitoxinId = srdAntitoxin.id;

    const [author, publisher] = await Promise.all([
      prisma.user.create({
        data: { username: `veg537-author-${Date.now()}`, passwordHash: 'x', displayName: 'Author' },
      }),
      prisma.user.create({
        data: { username: `veg537-admin-${Date.now()}`, passwordHash: 'x', displayName: 'Admin' },
      }),
    ]);

    const [privatePotion, privateAntitoxin, sharedPotion] = await Promise.all([
      prisma.item.create({
        data: {
          name: PRIVATE_POTION,
          category: 'Potion',
          cost: '50 GP',
          contentSource: 'homebrew',
          createdById: author.id,
          source: 'Homebrew',
        },
      }),
      // Same name as the SRD pool item: legal under the per-tier partial unique
      // index, and exactly the collision that lets a name-keyed read pick the
      // wrong row.
      prisma.item.create({
        data: {
          name: POOL_NAME,
          category: 'Adventuring Gear',
          cost: '1 GP',
          contentSource: 'homebrew',
          createdById: author.id,
          source: 'Homebrew',
        },
      }),
      prisma.item.create({
        data: {
          name: SHARED_POTION,
          category: 'Potion',
          cost: '75 GP',
          contentSource: 'shared',
          createdById: publisher.id,
          source: 'Shared',
        },
      }),
    ]);
    privatePotionId = privatePotion.id;
    privateAntitoxinId = privateAntitoxin.id;
    sharedPotionId = sharedPotion.id;

    // The real service with the real access helper, no Nest module, no mocks.
    // suggestStock is read-only and the fixtures are fixed, so one call serves
    // every assertion below.
    lines = await new ShopThemeService(prisma, new ContentAccessService()).suggestStock(
      'alchemist'
    );
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('never surfaces another user\u2019s homebrew, whether matched by category or by pool name', () => {
    const ids = lines.map(line => line.itemId);

    expect(ids).not.toContain(privatePotionId);
    expect(ids).not.toContain(privateAntitoxinId);
  });

  it('resolves a pool name that collides with a homebrew row to the SRD row', () => {
    const matches = lines.filter(line => line.name === POOL_NAME);

    expect(matches).toHaveLength(1);
    expect(matches[0].itemId).toBe(srdAntitoxinId);
  });

  it('still reads the whole global catalog, SRD potions and admin-published shared items alike', async () => {
    const ids = lines.map(line => line.itemId);
    expect(ids).toContain(sharedPotionId);

    // An SRD potion made it through, so the scoping narrowed the read rather
    // than emptying it. Checked against the seeded ids, not "any potion that is
    // not the shared one", so a leaked private potion could not satisfy it.
    const srdPotionIds = (
      await ctx.prisma.item.findMany({
        where: { category: 'Potion', contentSource: 'srd' },
        select: { id: true },
      })
    ).map(row => row.id);
    expect(srdPotionIds.length).toBeGreaterThan(0);
    expect(srdPotionIds.some(id => ids.includes(id))).toBe(true);
  });
});
