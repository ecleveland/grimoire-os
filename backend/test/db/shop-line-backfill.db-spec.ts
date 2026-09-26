// Real-DB regression test for the shop-line backfill (VEG-564).
//
// VEG-556 closed the write boundary on shop lines to the SRD and shared catalog
// but left stored rows alone, so ShopsService.update grandfathered any id the
// row already held. The edit form resends the whole stock on every save, and
// without that exemption one pre-rule homebrew line would have blocked every
// later edit of the shop. The 20260926120000_null_non_catalog_shop_line_ids
// migration nulls every stored id that does not resolve to the catalog, which
// is what lets the service drop the exemption. This spec runs that migration's
// real SQL against real rows, because the mocked unit suite cannot model a
// value that is already persisted.
import type { Prisma } from '@prisma/client';
import type { Currency, ShopLineItem } from '@grimoire-os/shared';
import {
  applyMigration,
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { CampaignAuthService } from '../../src/auth/campaign-auth.service';
import { ShopsService } from '../../src/shops/shops.service';
import { HOMEBREW_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';

const MIGRATION_DIR = '20260926120000_null_non_catalog_shop_line_ids';
const DANGLING_ID = '00000000-0000-4000-8000-000000000000';

const zero: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
const gp = (n: number): Currency => ({ ...zero, gp: n });
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

describe('shop lines that link non-catalog items, backfilled on a real DB (VEG-564)', () => {
  let ctx: SeedContext;
  let dmId: string;
  let mixedId: string;
  let cleanId: string;
  let emptyId: string;
  let customId: string;
  let scalarId: string;
  let sharedItemId: string;
  let mixedLines: ShopLineItem[];
  let cleanBefore: unknown;
  let emptyBefore: unknown;
  let customBefore: unknown;
  let cleanXmin: string;
  let emptyXmin: string;
  let customXmin: string;

  // Prisma sets `updatedAt` client-side, so a raw UPDATE leaves it alone and a
  // rewrite that writes back equal JSON would look untouched. `xmin` is the id
  // of the transaction that last wrote the row version, and every UPDATE
  // changes it, so it shows whether the guard skipped the row.
  const xminOf = async (id: string) => {
    const [row] = await ctx.prisma.$queryRaw<{ xmin: string }[]>`
      SELECT xmin::text AS xmin FROM "shops" WHERE "id" = ${id}`;
    return row.xmin;
  };

  const readItems = async (id: string) => {
    const row = await ctx.prisma.shop.findUniqueOrThrow({ where: { id } });
    return row.items as unknown as ShopLineItem[];
  };

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    const [dm, stranger] = await Promise.all([
      prisma.user.create({
        data: { username: `veg564-dm-${Date.now()}`, passwordHash: 'x', displayName: 'DM' },
      }),
      prisma.user.create({
        data: { username: `veg564-other-${Date.now()}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    dmId = dm.id;

    const campaign = await prisma.campaign.create({ data: { name: 'Backfill', ownerId: dmId } });

    const [srdItem, sharedItem, strangerHomebrew] = await Promise.all([
      prisma.item.create({
        data: { name: 'Elixir of Health', category: 'Potion', cost: '120 GP' },
      }),
      prisma.item.create({
        data: {
          name: 'Tonic of Vigour',
          category: 'Potion',
          cost: '75 GP',
          contentSource: 'shared',
        },
      }),
      prisma.item.create({
        data: {
          name: 'Smuggled Draught',
          category: 'Potion',
          cost: '1 GP',
          contentSource: 'homebrew',
          createdById: stranger.id,
          source: HOMEBREW_SOURCE_LABEL,
        },
      }),
    ]);

    // Written through Prisma, the way the API stored lines before the rule.
    const insertShop = (name: string, items: ShopLineItem[]) =>
      prisma.shop.create({
        data: {
          campaignId: campaign.id,
          createdById: dmId,
          name,
          theme: 'alchemist',
          items: asJson(items),
        },
      });

    mixedLines = [
      {
        itemId: srdItem.id,
        name: 'Elixir of Health',
        category: 'Potion',
        price: gp(120),
        stock: 3,
      },
      {
        itemId: sharedItem.id,
        name: 'Tonic of Vigour',
        category: 'Potion',
        price: gp(75),
        stock: 2,
      },
      {
        itemId: strangerHomebrew.id,
        name: 'Smuggled Draught',
        category: 'Potion',
        price: gp(1),
        stock: null,
        notes: 'under the counter',
      },
      { itemId: DANGLING_ID, name: 'Ghost Ledger', category: 'Curio', price: gp(7), stock: 1 },
      { itemId: null, name: 'Rumour', category: 'Service', price: gp(0), stock: null },
    ];

    sharedItemId = sharedItem.id;
    const [mixed, clean, empty, custom] = await Promise.all([
      insertShop('Mixed', mixedLines),
      insertShop('Clean', [
        {
          itemId: srdItem.id,
          name: 'Elixir of Health',
          category: 'Potion',
          price: gp(120),
          stock: null,
        },
        {
          itemId: sharedItem.id,
          name: 'Tonic of Vigour',
          category: 'Potion',
          price: gp(75),
          stock: null,
        },
      ]),
      insertShop('Empty', []),
      insertShop('Custom', [
        { itemId: null, name: 'Rumour', category: 'Service', price: gp(0), stock: null },
      ]),
    ]);
    mixedId = mixed.id;
    cleanId = clean.id;
    emptyId = empty.id;
    customId = custom.id;
    cleanBefore = await prisma.shop.findUniqueOrThrow({ where: { id: cleanId } });
    emptyBefore = await prisma.shop.findUniqueOrThrow({ where: { id: emptyId } });
    customBefore = await prisma.shop.findUniqueOrThrow({ where: { id: customId } });
    cleanXmin = await xminOf(cleanId);
    emptyXmin = await xminOf(emptyId);
    customXmin = await xminOf(customId);

    // A JSON scalar in the items column. Prisma will not write one, but the
    // column is plain JSONB, so raw SQL or a hand edit can. Expanding a scalar
    // as an array raises an error, so without the jsonb_typeof guard this row
    // would abort the whole migration.
    const [scalar] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "shops" ("id", "campaignId", "createdById", "name", "theme", "items",
                           "isOpen", "version", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${campaign.id}, ${dmId}, 'Scalar', 'alchemist',
              '"oops"'::jsonb, true, 0, now(), now())
      RETURNING "id"`;
    scalarId = scalar.id;

    // The stored row holds the non-catalog ids before the migration runs, so a
    // failure below cannot be mistaken for bad setup.
    expect((await readItems(mixedId)).map(l => l.itemId)).toEqual(mixedLines.map(l => l.itemId));

    await applyMigration(prisma, MIGRATION_DIR);
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('nulls the homebrew and dangling ids and keeps every other field', async () => {
    expect(await readItems(mixedId)).toEqual([
      mixedLines[0],
      mixedLines[1],
      { ...mixedLines[2], itemId: null },
      { ...mixedLines[3], itemId: null },
      mixedLines[4],
    ]);
  });

  it('keeps a shared id on a shop that also needed the backfill', async () => {
    const items = await readItems(mixedId);
    expect(items[1].itemId).toBe(sharedItemId);
  });

  it('leaves a catalog-only shop byte-identical', async () => {
    expect(await ctx.prisma.shop.findUniqueOrThrow({ where: { id: cleanId } })).toEqual(
      cleanBefore
    );
    expect(await xminOf(cleanId)).toBe(cleanXmin);
  });

  it('leaves an empty stock untouched', async () => {
    expect(await ctx.prisma.shop.findUniqueOrThrow({ where: { id: emptyId } })).toEqual(
      emptyBefore
    );
    expect(await xminOf(emptyId)).toBe(emptyXmin);
  });

  it('leaves a custom-only stock untouched', async () => {
    expect(await ctx.prisma.shop.findUniqueOrThrow({ where: { id: customId } })).toEqual(
      customBefore
    );
    expect(await xminOf(customId)).toBe(customXmin);
  });

  // Reaching this test at all means the migration ran without throwing, because
  // beforeAll applies it after inserting the scalar row.
  it('skips a shop whose items column holds a JSON scalar', async () => {
    const row = await ctx.prisma.shop.findUniqueOrThrow({ where: { id: scalarId } });
    expect(row.items).toBe('oops');
  });

  // Migrations get replayed against restored snapshots and stale environments.
  it('is idempotent', async () => {
    const afterFirst = await ctx.prisma.shop.findUniqueOrThrow({ where: { id: mixedId } });
    await applyMigration(ctx.prisma, MIGRATION_DIR);
    expect(await ctx.prisma.shop.findUniqueOrThrow({ where: { id: mixedId } })).toEqual(afterFirst);
  });

  // The point of the backfill: the edit form resends the whole stock, so the
  // stored ids have to be ones the boundary accepts without an exemption.
  it('lets the DM rename the backfilled shop by resending its lines', async () => {
    const shops = new ShopsService(
      ctx.prisma,
      new CampaignAuthService(ctx.prisma),
      new ContentAccessService()
    );
    const stored = await readItems(mixedId);

    const renamed = await shops.update(mixedId, dmId, { name: 'Renamed', items: stored });

    expect(renamed.name).toBe('Renamed');
    const items = await readItems(mixedId);
    expect(items.map(l => l.itemId)).toEqual([
      mixedLines[0].itemId,
      sharedItemId,
      null,
      null,
      null,
    ]);
  });
});
