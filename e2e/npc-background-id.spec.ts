import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-481: the NPC generator resolves a background's personality tables id-first,
// not by name. Since VEG-431 made Background homebrew-capable with per-tier partial
// unique indexes, an SRD/shared background and a homebrew one can legally share a
// name. The generator pool is pinned to the global (srd/shared) tiers, so a
// homebrew duplicate must never leak into a generated NPC's personality — and the
// picked row's id is persisted so resolution is unambiguous. Only a real database
// proves the loader selects the id and the id round-trips; unit specs mock Prisma.
test.describe('NPC generator background id resolution (VEG-481)', () => {
  test('a duplicate-named homebrew background never leaks into a generated NPC', async ({
    page,
  }) => {
    await registerAndLogin(page, 'npc-bg-id', 'E2E NPC Bg');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `NPC BG Campaign ${Date.now()}`, status: 'active' },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const { id: campaignId } = await campRes.json();

    // Author a homebrew "Acolyte" whose personality tables are a single unmistakable
    // sentinel. It collides with the SRD Acolyte's name but is homebrew-tier, so it
    // is excluded from the NPC generator pool.
    const SENTINEL = '__HOMEBREW_ACOLYTE_LEAK__';
    const create = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: {
        name: 'Acolyte',
        personalityTraits: [SENTINEL],
        ideals: [SENTINEL],
        bonds: [SENTINEL],
        flaws: [SENTINEL],
      },
      headers,
    });
    expect(create.status(), await create.text()).toBe(201);

    // Generate NPCs constrained to "Acolyte". The name is unique within the global
    // pool (the homebrew row is excluded), so every NPC draws the SRD Acolyte's
    // tables — the homebrew sentinel must never appear.
    for (let i = 0; i < 5; i++) {
      const res = await page.request.post(`${BACKEND}/api/npcs/generate`, {
        data: { campaignId, background: 'Acolyte', seed: `veg481-${i}` },
        headers,
      });
      expect(res.ok(), `generate failed: ${res.status()}`).toBeTruthy();
      const npc = await res.json();
      expect(npc.background).toBe('Acolyte');
      const everyLine = [...npc.personalityTraits, ...npc.ideals, ...npc.bonds, ...npc.flaws];
      expect(everyLine).not.toContain(SENTINEL);
      // The SRD Acolyte has non-empty tables, so a real trait was drawn.
      expect(everyLine.length).toBeGreaterThan(0);
    }
  });

  test('a generated NPC persists a backgroundId that resolves the correct catalog row', async ({
    page,
  }) => {
    await registerAndLogin(page, 'npc-bg-rt', 'E2E NPC RT');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `NPC RT Campaign ${Date.now()}`, status: 'active' },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const { id: campaignId } = await campRes.json();

    // Unconstrained generation picks a background row at random; the pipeline
    // captures that exact row's id.
    const res = await page.request.post(`${BACKEND}/api/npcs/generate`, {
      data: { campaignId, seed: 'veg481-roundtrip' },
      headers,
    });
    expect(res.ok(), `generate failed: ${res.status()}`).toBeTruthy();
    const npc = await res.json();

    const backgroundId = npc.generationParams?.decisions?.backgroundId;
    expect(backgroundId, 'generated NPC should persist a backgroundId').toBeTruthy();

    // The persisted id must point at a real catalog row whose name matches the
    // NPC's background, and whose tables are the source of the NPC's personality.
    const bgRes = await page.request.get(`${BACKEND}/api/srd/backgrounds/${backgroundId}`);
    expect(bgRes.ok(), `background fetch failed: ${bgRes.status()}`).toBeTruthy();
    const bg = await bgRes.json();
    expect(bg.name).toBe(npc.background);
    for (const trait of npc.personalityTraits as string[]) {
      expect(bg.personalityTraits).toContain(trait);
    }
  });
});
