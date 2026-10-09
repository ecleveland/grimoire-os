// Real-DB regression tests for the catalog-only rule on encounter loot (VEG-565).
// The unit specs mock Prisma, so they prove the service *asks* for srd + shared
// and nothing more. Whether a homebrew row actually fails to resolve is a
// property of the where clause against real rows, and only a database tests a
// where clause. Two homebrew items exist here on purpose: the DM's own and a
// stranger's. The write boundary refuses both, because every campaign member
// reads the encounter and only the owner can read a homebrew item. Ids already
// stored on an encounter are grandfathered, so a pre-rule row stays saveable.
import type { Prisma } from '../../src/generated/prisma/client';
import type { Combatant } from '@grimoire-os/shared';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { CampaignAuthService } from '../../src/auth/campaign-auth.service';
import { EncountersService } from '../../src/encounters/encounters.service';
import { MonsterLootService } from '../../src/loot/monster-loot.service';
import { HOMEBREW_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

type LootEntry = { itemId: string | null; name: string; quantity: number; source: 'monster' };

describe('catalog-only encounter loot on a real DB (VEG-565)', () => {
  let ctx: SeedContext;
  let encounters: EncountersService;

  let dmId: string;
  let campaignId: string;
  let srdItemId: string;
  let sharedItemId: string;
  let dmHomebrewId: string;
  let strangerHomebrewId: string;

  const entry = (itemId: string | null, name: string): LootEntry => ({
    itemId,
    name,
    quantity: 1,
    source: 'monster',
  });

  const goblin = (...items: LootEntry[]) => ({
    name: 'Goblin',
    isNpc: true,
    loot: { coinage: { gp: 0, sp: 0, cp: 0 }, items },
  });

  const storedLootIds = async (id: string) => {
    const stored = await ctx.prisma.encounter.findUniqueOrThrow({ where: { id } });
    const combatants = stored.combatants as unknown as Combatant[];
    return combatants.flatMap(c => c.loot?.items ?? []).map(i => i.itemId);
  };

  // An encounter that goes in through Prisma directly. The service refuses a
  // homebrew loot link now, so writing the row the way the old code would have
  // is the only way to get a pre-rule encounter to test against.
  const insertEncounter = (combatants: unknown[]) =>
    ctx.prisma.encounter.create({
      data: { campaignId, createdById: dmId, name: 'Old Ambush', combatants: asJson(combatants) },
    });

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    // The loot roller is never called here; the real service is wired only
    // because the constructor needs one.
    encounters = new EncountersService(
      prisma,
      new CampaignAuthService(prisma),
      new MonsterLootService(prisma),
      new ContentAccessService()
    );

    const [dm, stranger] = await Promise.all([
      prisma.user.create({
        data: { username: `veg565-dm-${Date.now()}`, passwordHash: 'x', displayName: 'DM' },
      }),
      prisma.user.create({
        data: { username: `veg565-other-${Date.now()}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    dmId = dm.id;

    const campaign = await prisma.campaign.create({
      data: { name: 'Loot Rules', ownerId: dmId },
    });
    campaignId = campaign.id;

    const homebrew = (createdById: string) =>
      ({ contentSource: 'homebrew', createdById, source: HOMEBREW_SOURCE_LABEL }) as const;
    const [srdItem, sharedItem, dmHomebrew, strangerHomebrew] = await Promise.all([
      prisma.item.create({ data: { name: 'Dagger', category: 'Weapon', cost: '2 GP' } }),
      // Shared rows need no creator; the ownership CHECK constrains homebrew only.
      prisma.item.create({
        data: {
          name: 'Silver Locket',
          category: 'Trinket',
          cost: '25 GP',
          contentSource: 'shared',
        },
      }),
      prisma.item.create({
        data: { name: 'Cursed Idol', category: 'Trinket', cost: '1 GP', ...homebrew(dmId) },
      }),
      prisma.item.create({
        data: {
          name: 'Smuggled Draught',
          category: 'Potion',
          cost: '1 GP',
          ...homebrew(stranger.id),
        },
      }),
    ]);
    srdItemId = srdItem.id;
    sharedItemId = sharedItem.id;
    dmHomebrewId = dmHomebrew.id;
    strangerHomebrewId = strangerHomebrew.id;
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('create', () => {
    it('accepts SRD and shared items and persists both ids', async () => {
      const encounter = await encounters.create(dmId, {
        campaignId,
        name: 'Ambush',
        combatants: [goblin(entry(srdItemId, 'Dagger'), entry(sharedItemId, 'Silver Locket'))],
      });

      expect(await storedLootIds(encounter.id)).toEqual([srdItemId, sharedItemId]);
    });

    it("refuses the DM's own homebrew item", async () => {
      await expect(
        encounters.create(dmId, {
          campaignId,
          name: 'Ambush',
          combatants: [goblin(entry(dmHomebrewId, 'Cursed Idol'))],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: [
            'Loot "Cursed Idol" on combatant "Goblin" links an item that is not in the SRD or shared catalog',
            'Encounter loot may link SRD or shared catalog items only, and homebrew items are not eligible',
          ],
        }),
      });
    });

    it("refuses a stranger's homebrew item", async () => {
      await expect(
        encounters.create(dmId, {
          campaignId,
          name: 'Ambush',
          combatants: [goblin(entry(strangerHomebrewId, 'Smuggled Draught'))],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('homebrew items are not eligible'),
          ]),
        }),
      });
    });
  });

  describe('update', () => {
    it('refuses a homebrew item and leaves the stored loot untouched', async () => {
      const encounter = await encounters.create(dmId, {
        campaignId,
        name: 'Ambush',
        combatants: [goblin(entry(srdItemId, 'Dagger'))],
      });

      await expect(
        encounters.update(encounter.id, dmId, {
          combatants: [goblin(entry(strangerHomebrewId, 'Smuggled Draught'))],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('homebrew items are not eligible'),
          ]),
        }),
      });

      expect(await storedLootIds(encounter.id)).toEqual([srdItemId]);
    });

    it('still saves an encounter whose stored loot predates the rule', async () => {
      const combatants = [goblin(entry(strangerHomebrewId, 'Smuggled Draught'))];
      const encounter = await insertEncounter(combatants);

      const renamed = await encounters.update(encounter.id, dmId, {
        name: 'Renamed',
        combatants,
      });

      expect(renamed.name).toBe('Renamed');
      expect(await storedLootIds(encounter.id)).toEqual([strangerHomebrewId]);
    });

    it('still refuses a new homebrew loot entry added to that same encounter', async () => {
      const encounter = await insertEncounter([
        goblin(entry(strangerHomebrewId, 'Smuggled Draught')),
      ]);

      await expect(
        encounters.update(encounter.id, dmId, {
          combatants: [
            goblin(
              entry(strangerHomebrewId, 'Smuggled Draught'),
              entry(dmHomebrewId, 'Cursed Idol')
            ),
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: [
            'Loot "Cursed Idol" on combatant "Goblin" links an item that is not in the SRD or shared catalog',
            expect.stringContaining('homebrew items are not eligible'),
          ],
        }),
      });

      expect(await storedLootIds(encounter.id)).toEqual([strangerHomebrewId]);
    });
  });
});
