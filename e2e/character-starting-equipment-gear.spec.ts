import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-462: the guided builder emits starting equipment as bare {name, quantity}
// lines — it has no catalog lookup — so a freshly-built Fighter's chain mail
// carried no `gear` snapshot and contributed nothing to derived AC until the
// player deleted it and re-added it from the sheet's catalog picker. Character
// create now backfills `itemId` + `gear` against the srd catalog.
//
// Only a real database proves this: the unit specs mock Prisma, so they can't
// catch the failure mode that actually shipped the bug — the seed's hand-written
// "Chain mail" not matching the extracted catalog's "Chain Mail".
test.describe('starting equipment gear snapshots (VEG-462)', () => {
  test('a bare seed-cased armor line is linked and snapshotted, and drives AC once equipped', async ({
    page,
  }) => {
    await registerAndLogin(page, 'start-gear', 'E2E Equipment Builder');
    const headers = await csrfHeaders(page);

    // Exactly what the guided builder's Equipment step produces: seed casing,
    // no itemId, no gear. "Any martial weapon" is a player-choice placeholder
    // with no catalog row and must survive untouched.
    const create = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Fresh Fighter',
        race: 'Human',
        class: 'Fighter',
        level: 1,
        abilityScores: {
          strength: 16,
          dexterity: 12,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        inventory: [
          { name: 'Chain mail', quantity: 1, equipped: false },
          { name: 'Any martial weapon', quantity: 1, equipped: false },
        ],
      },
      headers,
    });
    expect(create.status(), await create.text()).toBe(201);
    const character = await create.json();

    const [armor, placeholder] = character.inventory;

    // The name folded onto the catalog's "Chain Mail" despite the case drift.
    expect(armor.itemId).toBeTruthy();
    expect(armor.gear).toMatchObject({
      type: 'armor',
      armorType: 'heavy',
      baseArmorClass: 16,
    });

    // A placeholder resolves to nothing rather than guessing at a real item.
    expect(placeholder.itemId).toBeUndefined();
    expect(placeholder.gear).toBeUndefined();

    // Unequipped on create — this ships parity with the catalog picker, which
    // also adds items unequipped. Auto-equipping starting armor is a separate
    // product decision.
    expect(armor.equipped).toBe(false);

    // ── The payoff: the snapshot is what derived AC reads ──────────────────
    // Heavy armor ignores Dex, so equipping chain mail pins AC at its base 16.
    const equip = await page.request.patch(`${BACKEND}/api/characters/${character.id}`, {
      data: {
        inventory: [{ ...armor, equipped: true }, placeholder],
      },
      headers,
    });
    expect(equip.status(), await equip.text()).toBe(200);

    const equipped = await equip.json();
    // No stored armorClass override, so `effective` is the derived value.
    expect(equipped.computed.armorClass.derived).toBe(16);
    expect(equipped.computed.armorClass.effective).toBe(16);
  });

  test('a client-supplied gear snapshot is never overwritten by the catalog', async ({ page }) => {
    await registerAndLogin(page, 'start-gear-trust', 'E2E Snapshot Keeper');
    const headers = await csrfHeaders(page);

    // VEG-410 established that `gear` is snapshotted at pick time. Resolution
    // is additive only: a line that already carries a snapshot keeps it, even
    // when its name would resolve to a catalog row with different stats.
    //
    // The inventory is deliberately MIXED — a snapshotted line plus a bare one.
    // A lone snapshotted line short-circuits before per-line resolution runs,
    // so it would pass even if the preservation guard were deleted; the bare
    // sibling is what forces the snapshotted line through the resolver.
    const custom = { type: 'armor', armorType: 'heavy', baseArmorClass: 99 };

    const create = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Snapshot Keeper',
        class: 'Fighter',
        level: 1,
        inventory: [
          { name: 'Chain mail', quantity: 1, equipped: false, gear: custom },
          { name: 'Longsword', quantity: 1, equipped: false },
        ],
      },
      headers,
    });
    expect(create.status(), await create.text()).toBe(201);

    const [snapshotted, bare] = (await create.json()).inventory;
    // The client's AC 99 survives; the SRD's 16 does not overwrite it.
    expect(snapshotted.gear).toMatchObject({ baseArmorClass: 99 });
    // ...and the line still gained its catalog link, since that destroys nothing.
    expect(snapshotted.itemId).toBeTruthy();
    // The sibling resolved normally.
    expect(bare.gear).toMatchObject({ type: 'weapon', damage: '1d8' });
  });
});
