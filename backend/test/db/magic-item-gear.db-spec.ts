// Real-DB regression test for the VEG-460 magic-shield enrichment. The seed
// overlay stamps a "+2" AC onto fixed-base magic shields; this proves the
// enrichment survives the full seed → Item column round-trip (which the mocked
// loader/seed specs can't) and that `gearMetaFromItem` derives a shield from the
// persisted row. Runs via `npm run test:db` against the disposable test DB.
import { gearMetaFromItem } from '@grimoire-os/shared';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';

describe('magic-item gear enrichment — real DB (VEG-460)', () => {
  let ctx: SeedContext;

  beforeAll(async () => {
    ctx = await createSeedContext();
    await truncateAll(ctx.prisma);
    await ctx.seed.seed();
  }, 300_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  it('persists a "+2" armorClass on an overlaid magic shield and derives a shield from it', async () => {
    const shield = await ctx.prisma.item.findFirstOrThrow({ where: { name: 'Sentinel Shield' } });
    expect(shield.category).toBe('Armor');
    expect(shield.isMagic).toBe(true);
    expect(shield.properties).toContain('Shield');
    expect(shield.armorClass).toBe('+2');
    expect(gearMetaFromItem(shield)).toEqual({
      type: 'armor',
      armorType: 'shield',
      armorClassBonus: 2,
    });
  });

  it('stamps Shield of the Cavalier as "+4" (its unconditional bonus stacks with the base)', async () => {
    const shield = await ctx.prisma.item.findFirstOrThrow({
      where: { name: 'Shield of the Cavalier' },
    });
    expect(shield.armorClass).toBe('+4');
    expect(gearMetaFromItem(shield)).toEqual({
      type: 'armor',
      armorType: 'shield',
      armorClassBonus: 4,
    });
  });

  it('leaves excluded magic gear unenriched (still no derivable stats)', async () => {
    // Body armor with no concrete base, a "+N" weapon, and the generic shield
    // variant all stay null → underivable (the picker hint covers them).
    for (const name of ['Adamantine Armor', 'Flame Tongue', 'Shield, +1, +2, or +3']) {
      const row = await ctx.prisma.item.findFirstOrThrow({ where: { name } });
      expect(row.armorClass).toBeNull();
      expect(row.damage).toBeNull();
      expect(gearMetaFromItem(row)).toBeNull();
    }
  });
});
