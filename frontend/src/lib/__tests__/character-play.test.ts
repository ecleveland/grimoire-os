import { describe, it, expect } from 'vitest';
import {
  damageHitPoints,
  healHitPoints,
  setTempHitPoints,
  togglePip,
  adjustHitDiceSpent,
  deathSavesAfterRevive,
  parseNonNegativeInt,
  CLEARED_DEATH_SAVES,
  hitDiceRegainedOnLongRest,
  exhaustionAfterLongRest,
  shortRestHealPerDie,
  applyLongRest,
  applyShortRest,
  formatLongRestSummary,
  formatShortRestSummary,
  toggleConditionInList,
  setExhaustionLevel,
  concentrationFromSpellInput,
} from '../character-play';

describe('character-play HP helpers', () => {
  describe('damageHitPoints', () => {
    it('spends temp HP before current', () => {
      expect(damageHitPoints({ max: 20, current: 18, temporary: 5 }, 3)).toEqual({
        max: 20,
        current: 18,
        temporary: 2,
      });
    });

    it('overflows past temp into current', () => {
      expect(damageHitPoints({ max: 20, current: 18, temporary: 5 }, 8)).toEqual({
        max: 20,
        current: 15,
        temporary: 0,
      });
    });

    it('floors current at 0 and never goes negative', () => {
      expect(damageHitPoints({ max: 20, current: 4, temporary: 0 }, 100)).toEqual({
        max: 20,
        current: 0,
        temporary: 0,
      });
    });

    it('ignores non-positive amounts', () => {
      const hp = { max: 20, current: 18, temporary: 5 };
      expect(damageHitPoints(hp, 0)).toEqual(hp);
      expect(damageHitPoints(hp, -5)).toEqual(hp);
    });
  });

  describe('healHitPoints', () => {
    it('raises current, clamped to max, leaving temp untouched', () => {
      expect(healHitPoints({ max: 20, current: 15, temporary: 4 }, 100)).toEqual({
        max: 20,
        current: 20,
        temporary: 4,
      });
    });

    it('ignores non-positive amounts', () => {
      const hp = { max: 20, current: 10, temporary: 0 };
      expect(healHitPoints(hp, 0)).toEqual(hp);
    });
  });

  describe('setTempHitPoints', () => {
    it('sets temp HP directly (overwrites, not max-stacking)', () => {
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, 3)).toEqual({
        max: 20,
        current: 10,
        temporary: 3,
      });
    });

    it('clamps to a non-negative integer', () => {
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, -5).temporary).toBe(0);
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, 4.7).temporary).toBe(4);
    });
  });
});

describe('togglePip', () => {
  it('fills up to and including the clicked index', () => {
    expect(togglePip(0, 0, 3)).toBe(1); // click first → 1
    expect(togglePip(0, 2, 3)).toBe(3); // click third → 3
    expect(togglePip(1, 2, 3)).toBe(3); // extend from 1 to 3
  });

  it('clears the highest filled pip when re-clicked', () => {
    expect(togglePip(3, 2, 3)).toBe(2); // click the last filled → drop to 2
    expect(togglePip(1, 0, 3)).toBe(0); // click only filled → clear
  });

  it('clamps to max (used for spell slots bounded by total)', () => {
    expect(togglePip(0, 4, 2)).toBe(2); // index beyond max clamps down
  });
});

describe('adjustHitDiceSpent', () => {
  const hd = { dieType: 'd10' as const, total: 8, spent: 3 };

  it('spends one (caps at total)', () => {
    expect(adjustHitDiceSpent(hd, 1).spent).toBe(4);
    expect(adjustHitDiceSpent({ ...hd, spent: 8 }, 1).spent).toBe(8);
  });

  it('restores one (floors at 0)', () => {
    expect(adjustHitDiceSpent(hd, -1).spent).toBe(2);
    expect(adjustHitDiceSpent({ ...hd, spent: 0 }, -1).spent).toBe(0);
  });

  it('preserves dieType and total', () => {
    expect(adjustHitDiceSpent(hd, 1)).toEqual({ dieType: 'd10', total: 8, spent: 4 });
  });
});

describe('CLEARED_DEATH_SAVES', () => {
  it('is a zeroed track for revive-above-0', () => {
    expect(CLEARED_DEATH_SAVES).toEqual({ successes: 0, failures: 0 });
  });
});

describe('deathSavesAfterRevive', () => {
  it('returns a zeroed track when healed above 0 with saves present', () => {
    expect(deathSavesAfterRevive(5, { successes: 1, failures: 2 })).toEqual({
      successes: 0,
      failures: 0,
    });
  });

  it('returns null when still at 0 (no revive)', () => {
    expect(deathSavesAfterRevive(0, { successes: 1, failures: 2 })).toBeNull();
  });

  it('returns null when there are no saves to clear', () => {
    expect(deathSavesAfterRevive(5, { successes: 0, failures: 0 })).toBeNull();
  });
});

describe('hitDiceRegainedOnLongRest', () => {
  it('regains half the total hit dice, rounded down', () => {
    expect(hitDiceRegainedOnLongRest(10)).toBe(5);
    expect(hitDiceRegainedOnLongRest(5)).toBe(2);
    expect(hitDiceRegainedOnLongRest(2)).toBe(1);
  });

  it('regains at least one die — the 5e minimum (a level-1 PC)', () => {
    expect(hitDiceRegainedOnLongRest(1)).toBe(1);
  });
});

describe('exhaustionAfterLongRest', () => {
  it('reduces the exhaustion level by one', () => {
    expect(exhaustionAfterLongRest(6)).toBe(5);
    expect(exhaustionAfterLongRest(3)).toBe(2);
    expect(exhaustionAfterLongRest(2)).toBe(1);
  });

  it('clears the track entirely at level 1', () => {
    // The sheet's track is 1-6 with null meaning "no exhaustion"
    // (StatusTracker reads `character.exhaustion || null`), so stepping down
    // from 1 must be null rather than a stored 0.
    expect(exhaustionAfterLongRest(1)).toBeNull();
  });

  it('leaves an unexhausted character alone', () => {
    expect(exhaustionAfterLongRest(null)).toBeNull();
    expect(exhaustionAfterLongRest(0)).toBeNull();
  });
});

describe('shortRestHealPerDie', () => {
  it('heals the die roll plus the CON modifier', () => {
    expect(shortRestHealPerDie(7, 2)).toBe(9);
    expect(shortRestHealPerDie(1, 3)).toBe(4);
  });

  it('floors at 0 when a negative CON modifier outweighs the roll', () => {
    // Diverges deliberately from `hpGain` (character-level.ts), which clamps to
    // a minimum of 1 — that is the *level-up* rule ("minimum 1 HP per level").
    // A short rest has no such minimum: a bad roll with a penalty heals nothing.
    expect(shortRestHealPerDie(1, -3)).toBe(0);
    expect(shortRestHealPerDie(2, -2)).toBe(0);
  });
});

describe('applyLongRest', () => {
  const base = {
    hitPoints: { max: 44, current: 12, temporary: 6 },
    spellSlots: [],
    hitDice: { dieType: 'd10' as const, total: 8, spent: 5 },
  };

  it('restores HP to max and clears temp HP', () => {
    expect(applyLongRest(base).hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('clears death saves', () => {
    expect(applyLongRest(base).deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('regains half the total hit dice (rounded down), capped at the number spent', () => {
    // total 8 → regain 4; spent 5 → 1 remaining spent
    expect(applyLongRest(base).hitDice).toEqual({ dieType: 'd10', total: 8, spent: 1 });
  });

  it('never restores more hit dice than were spent', () => {
    // total 8 → regain 4, but only 2 spent → floors at 0
    const patch = applyLongRest({ ...base, hitDice: { dieType: 'd10', total: 8, spent: 2 } });
    expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 0 });
  });

  it('regains at least one hit die for a level-1 character', () => {
    const patch = applyLongRest({ ...base, hitDice: { dieType: 'd8', total: 1, spent: 1 } });
    expect(patch.hitDice).toEqual({ dieType: 'd8', total: 1, spent: 0 });
  });

  it('omits hitDice from the patch when the character has none', () => {
    const patch = applyLongRest({ ...base, hitDice: undefined });
    expect('hitDice' in patch).toBe(false);
  });

  it('resets every spell slot to used:0', () => {
    const patch = applyLongRest({
      ...base,
      spellSlots: [
        { level: 1, total: 4, used: 3 },
        { level: 2, total: 3, used: 1 },
      ],
    });
    expect(patch.spellSlots).toEqual([
      { level: 1, total: 4, used: 0 },
      { level: 2, total: 3, used: 0 },
    ]);
  });

  it('omits spellSlots from the patch for a non-caster (no slots)', () => {
    expect('spellSlots' in applyLongRest(base)).toBe(false);
  });

  it('tolerates a null spellSlots (the API returns null for non-casters)', () => {
    // Regression: Character types spellSlots as non-optional, but real data has
    // null — `.length` on it threw at runtime (VEG-407 manual test).
    const patch = applyLongRest({ ...base, spellSlots: null });
    expect('spellSlots' in patch).toBe(false);
    expect(patch.hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('tolerates a null hitDice', () => {
    const patch = applyLongRest({ ...base, hitDice: null });
    expect('hitDice' in patch).toBe(false);
  });

  it('omits hitPoints for a null-HP character (never persists a fabricated block)', () => {
    // Regression (VEG-425): Character declared hitPoints non-optional, but the
    // column is `Json?`; `{ ...null }` threw. A minimal character rests without a
    // hitPoints patch — we must not write a fabricated {0,0,0} block to the DB.
    const patch = applyLongRest({ ...base, hitPoints: null });
    expect('hitPoints' in patch).toBe(false);
    // The rest still clears death saves and regains hit dice.
    expect(patch.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 1 });
  });

  // ── Resource recovery (VEG-409) ─────────────────────────
  const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
  const rage = { name: 'Rage', max: 3, used: 2, recharge: 'long' as const };

  it('resets every resource (short and long recharge) to used:0', () => {
    const patch = applyLongRest({ ...base, resources: [ki, rage] });
    expect(patch.resources).toEqual([
      { ...ki, used: 0 },
      { ...rage, used: 0 },
    ]);
  });

  it('omits resources from the patch when the character has none', () => {
    expect('resources' in applyLongRest(base)).toBe(false);
    expect('resources' in applyLongRest({ ...base, resources: null })).toBe(false);
    expect('resources' in applyLongRest({ ...base, resources: [] })).toBe(false);
  });

  it('omits spellSlots when no slot has been spent', () => {
    // Same defect class as the resources one below: the patch forces every slot
    // to used:0, so a presence check on it can't tell "restored" from "already
    // full" — and an identical array still burns an optimistic-lock version.
    const patch = applyLongRest({
      ...base,
      spellSlots: [
        { level: 1, total: 4, used: 0 },
        { level: 2, total: 3, used: 0 },
      ],
    });
    expect('spellSlots' in patch).toBe(false);
  });

  it('patches every slot when at least one was spent', () => {
    const patch = applyLongRest({
      ...base,
      spellSlots: [
        { level: 1, total: 4, used: 0 },
        { level: 2, total: 3, used: 2 },
      ],
    });
    expect(patch.spellSlots).toEqual([
      { level: 1, total: 4, used: 0 },
      { level: 2, total: 3, used: 0 },
    ]);
  });

  it('omits hitPoints when already at max with no temp HP', () => {
    const patch = applyLongRest({
      ...base,
      hitPoints: { max: 44, current: 44, temporary: 0 },
    });
    expect('hitPoints' in patch).toBe(false);
  });

  it('still patches hitPoints at max when temp HP must be cleared', () => {
    // Temp HP does not survive a long rest (5e), so this is a real change even
    // though `current` is untouched.
    const patch = applyLongRest({
      ...base,
      hitPoints: { max: 44, current: 44, temporary: 9 },
    });
    expect(patch.hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('omits resources when every pool is already full', () => {
    // Found in manual testing (VEG-487): resting twice in a row reported
    // "resources recharged" the second time. The patch carried an identical
    // array, which both burns an optimistic-lock version and makes the summary
    // claim a recovery that never happened.
    const full = [
      { ...ki, used: 0 },
      { ...rage, used: 0 },
    ];
    expect('resources' in applyLongRest({ ...base, resources: full })).toBe(false);
  });

  it('still patches resources when only one pool has uses to recover', () => {
    const patch = applyLongRest({ ...base, resources: [{ ...ki, used: 0 }, rage] });
    expect(patch.resources).toEqual([
      { ...ki, used: 0 },
      { ...rage, used: 0 },
    ]);
  });

  // ── Exhaustion recovery (VEG-487) ───────────────────────
  // The seeded `long-rest` game rule: "Reduce exhaustion level by 1 (if fed)".

  it('reduces exhaustion by one level', () => {
    expect(applyLongRest({ ...base, exhaustion: 3 }).exhaustion).toBe(2);
  });

  it('clears the exhaustion track when resting off the last level', () => {
    expect(applyLongRest({ ...base, exhaustion: 1 }).exhaustion).toBeNull();
  });

  it('omits exhaustion from the patch for an unexhausted character', () => {
    // Writing an unchanged field burns an optimistic-lock version and 409s a
    // concurrent session for a rest that changed nothing about exhaustion.
    expect('exhaustion' in applyLongRest(base)).toBe(false);
    expect('exhaustion' in applyLongRest({ ...base, exhaustion: null })).toBe(false);
    expect('exhaustion' in applyLongRest({ ...base, exhaustion: 0 })).toBe(false);
  });
});

describe('applyShortRest (VEG-409)', () => {
  const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
  const rage = { name: 'Rage', max: 3, used: 2, recharge: 'long' as const };

  it("resets only recharge:'short' resources, leaving long-rest pools spent", () => {
    const patch = applyShortRest({ resources: [ki, rage] });
    expect(patch.resources).toEqual([{ ...ki, used: 0 }, rage]);
  });

  it('patches only resources — HP, hit dice, slots, and death saves are untouched', () => {
    expect(Object.keys(applyShortRest({ resources: [ki] }))).toEqual(['resources']);
  });

  it('returns an empty patch when the character has no resources', () => {
    expect(applyShortRest({ resources: null })).toEqual({});
    expect(applyShortRest({ resources: [] })).toEqual({});
    expect(applyShortRest({})).toEqual({});
  });

  it('returns an empty patch when no short-recharge resource has uses to recover', () => {
    // Patching an identical array would burn an optimistic-lock version and
    // 409 a concurrent session for a click that changed nothing.
    expect(applyShortRest({ resources: [rage] })).toEqual({});
    expect(applyShortRest({ resources: [{ ...ki, used: 0 }, rage] })).toEqual({});
  });

  // ── Hit-dice healing (VEG-487) ──────────────────────────
  // 5e: on a short rest a player may spend hit dice, each healing its roll plus
  // the CON modifier. `spentDice` carries the per-die heal totals the dialog
  // already resolved (rolled or fixed average), so this stays pure.

  describe('with spent hit dice', () => {
    const base = {
      hitPoints: { max: 44, current: 12, temporary: 0 },
      hitDice: { dieType: 'd10' as const, total: 8, spent: 2 },
    };

    it('heals the summed dice and marks them spent', () => {
      const patch = applyShortRest(base, { healPerDie: [9, 5] });
      expect(patch.hitPoints).toEqual({ max: 44, current: 26, temporary: 0 });
      expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 4 });
    });

    it('clamps healing at max HP', () => {
      const patch = applyShortRest(
        { ...base, hitPoints: { max: 44, current: 40, temporary: 0 } },
        { healPerDie: [9, 9] }
      );
      expect(patch.hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
    });

    it('never spends more dice than remain', () => {
      // 8 total, 7 already spent — only one die is actually available.
      const patch = applyShortRest(
        { ...base, hitDice: { dieType: 'd10', total: 8, spent: 7 } },
        { healPerDie: [6, 6, 6] }
      );
      expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 8 });
      // Only the die the clamp allowed may heal.
      expect(patch.hitPoints).toEqual({ max: 44, current: 18, temporary: 0 });
    });

    it('omits hitDice entirely when every die is already spent', () => {
      // Otherwise the patch carries an identical hitDice block, which is
      // non-empty enough to look confirmable and burns a version for nothing.
      const patch = applyShortRest(
        { ...base, hitDice: { dieType: 'd10', total: 8, spent: 8 } },
        { healPerDie: [6, 6] }
      );
      expect(patch).toEqual({});
    });

    it('does not heal temporary HP', () => {
      const patch = applyShortRest(
        { ...base, hitPoints: { max: 44, current: 12, temporary: 6 } },
        { healPerDie: [4] }
      );
      expect(patch.hitPoints).toEqual({ max: 44, current: 16, temporary: 6 });
    });

    it('clears death saves when the heal revives a downed character', () => {
      const patch = applyShortRest(
        {
          ...base,
          hitPoints: { max: 44, current: 0, temporary: 0 },
          deathSaves: { successes: 1, failures: 2 },
        },
        { healPerDie: [7] }
      );
      expect(patch.hitPoints?.current).toBe(7);
      expect(patch.deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it('omits death saves when there are none to clear', () => {
      const patch = applyShortRest(
        { ...base, deathSaves: { successes: 0, failures: 0 } },
        { healPerDie: [7] }
      );
      expect('deathSaves' in patch).toBe(false);
    });

    it('clears stale death saves left on a character already above 0 HP', () => {
      // Matches the Heal button's behavior: `deathSavesAfterRevive` clears
      // whenever a heal lands above 0 and saves are on the sheet, rather than
      // tracking whether the character was down. Saves above 0 HP are a stale
      // state, so any heal tidies them.
      const patch = applyShortRest(
        { ...base, deathSaves: { successes: 1, failures: 1 } },
        { healPerDie: [7] }
      );
      expect(patch.deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it('omits hitPoints for a null-HP character (never persists a fabricated block)', () => {
      // Same VEG-425 invariant `applyLongRest` holds: a minimal character has no
      // stored HP block and a rest must not fabricate one.
      const patch = applyShortRest({ ...base, hitPoints: null }, { healPerDie: [7] });
      expect('hitPoints' in patch).toBe(false);
      // The dice are still marked spent.
      expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 3 });
    });

    it('omits hitDice when the character has none to spend', () => {
      const patch = applyShortRest({ ...base, hitDice: null }, { healPerDie: [7] });
      expect('hitDice' in patch).toBe(false);
      expect('hitPoints' in patch).toBe(false);
    });

    it('recharges short-rest resources in the same composite patch', () => {
      const patch = applyShortRest({ ...base, resources: [ki, rage] }, { healPerDie: [7] });
      expect(patch.resources).toEqual([{ ...ki, used: 0 }, rage]);
      expect(patch.hitPoints?.current).toBe(19);
    });

    it('ignores an empty dice list — behaves exactly like a resource-only rest', () => {
      expect(applyShortRest(base, { healPerDie: [] })).toEqual({});
      expect(applyShortRest({ ...base, resources: [ki] }, { healPerDie: [] })).toEqual({
        resources: [{ ...ki, used: 0 }],
      });
    });

    it('still spends the die when the roll heals nothing (negative CON modifier)', () => {
      // A 0-heal die is a real cost the player chose to pay — swallowing it
      // would silently hand back a resource 5e says is gone. HP is left out of
      // the patch entirely, since an unchanged block is not worth a write.
      const patch = applyShortRest(base, { healPerDie: [0] });
      expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 3 });
      expect('hitPoints' in patch).toBe(false);
    });
  });
});

describe('rest summaries (VEG-487)', () => {
  const hitPoints = { max: 44, current: 12, temporary: 6 };
  const hitDice = { dieType: 'd10' as const, total: 8, spent: 5 };

  describe('formatLongRestSummary', () => {
    it('reports HP healed, hit dice regained, slots, and exhaustion', () => {
      const character = {
        hitPoints,
        hitDice,
        spellSlots: [{ level: 1, total: 4, used: 3 }],
        exhaustion: 3,
      };
      const summary = formatLongRestSummary(character, applyLongRest(character));
      expect(summary).toContain('+32 HP');
      expect(summary).toContain('4 hit dice');
      expect(summary).toContain('spell slots');
      expect(summary).toContain('exhaustion');
    });

    it('omits what did not change', () => {
      // A fully-rested character: nothing to heal, nothing to regain.
      const character = {
        hitPoints: { max: 44, current: 44, temporary: 0 },
        hitDice: { dieType: 'd10' as const, total: 8, spent: 0 },
        spellSlots: [],
      };
      const summary = formatLongRestSummary(character, applyLongRest(character));
      expect(summary).not.toContain('HP');
      expect(summary).not.toContain('hit dice');
      expect(summary).toMatch(/nothing to recover|already/i);
    });

    it('does not claim spell slots were restored when none were spent', () => {
      const character = {
        hitPoints: { max: 44, current: 44, temporary: 0 },
        hitDice: { dieType: 'd10' as const, total: 8, spent: 0 },
        spellSlots: [{ level: 1, total: 4, used: 0 }],
      };
      const summary = formatLongRestSummary(character, applyLongRest(character));
      expect(summary).not.toMatch(/spell slot/i);
    });

    it('reports temp HP being cleared, which is otherwise invisible', () => {
      // A long rest destroys temp HP (5e). Reporting only the `current` delta
      // said "already fully rested" while silently consuming a real resource.
      const character = {
        hitPoints: { max: 44, current: 44, temporary: 15 },
        hitDice: { dieType: 'd10' as const, total: 8, spent: 0 },
        spellSlots: [],
      };
      const summary = formatLongRestSummary(character, applyLongRest(character));
      expect(summary).toMatch(/temp/i);
      expect(summary).not.toMatch(/already fully rested/i);
    });

    it('does not claim a recharge when every resource is already full', () => {
      // Manual-test regression (VEG-487): a second consecutive long rest said
      // "resources recharged" with nothing spent.
      const character = {
        hitPoints: { max: 44, current: 44, temporary: 0 },
        hitDice: { dieType: 'd10' as const, total: 8, spent: 0 },
        spellSlots: [],
        resources: [{ name: 'Arcane Recovery', max: 1, used: 0, recharge: 'short' as const }],
      };
      const summary = formatLongRestSummary(character, applyLongRest(character));
      expect(summary).not.toMatch(/resource/i);
    });
  });

  describe('formatShortRestSummary', () => {
    it('reports HP healed and dice spent', () => {
      const character = { hitPoints, hitDice };
      const summary = formatShortRestSummary(
        character,
        applyShortRest(character, { healPerDie: [9, 5] })
      );
      expect(summary).toContain('+14 HP');
      expect(summary).toContain('2 hit dice');
    });

    it('uses the singular for a single die', () => {
      const character = { hitPoints, hitDice };
      const summary = formatShortRestSummary(
        character,
        applyShortRest(character, { healPerDie: [7] })
      );
      expect(summary).toContain('1 hit die');
      expect(summary).not.toContain('hit dice');
    });

    it('reports a resource-only rest', () => {
      const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
      const character = { hitPoints, hitDice, resources: [ki] };
      const summary = formatShortRestSummary(character, applyShortRest(character));
      expect(summary).toMatch(/resource/i);
      expect(summary).not.toContain('HP');
    });
  });
});

describe('parseNonNegativeInt', () => {
  it('parses a positive integer', () => {
    expect(parseNonNegativeInt('12')).toBe(12);
  });

  it('floors fractional input', () => {
    expect(parseNonNegativeInt('4.7')).toBe(4);
  });

  it('clamps negatives to 0', () => {
    expect(parseNonNegativeInt('-5')).toBe(0);
  });

  it('treats blank/non-numeric as 0', () => {
    expect(parseNonNegativeInt('')).toBe(0);
    expect(parseNonNegativeInt('abc')).toBe(0);
  });
});

describe('status tracker helpers (VEG-408)', () => {
  describe('toggleConditionInList', () => {
    it('adds a condition not in the list', () => {
      expect(toggleConditionInList(['Poisoned'], 'Prone')).toEqual(['Poisoned', 'Prone']);
    });

    it('removes a condition already in the list', () => {
      expect(toggleConditionInList(['Poisoned', 'Prone'], 'Poisoned')).toEqual(['Prone']);
    });

    it('adds to an empty list', () => {
      expect(toggleConditionInList([], 'Blinded')).toEqual(['Blinded']);
    });

    it('does not mutate the input list', () => {
      const input: ReturnType<typeof toggleConditionInList> = ['Poisoned'];
      toggleConditionInList(input, 'Prone');
      expect(input).toEqual(['Poisoned']);
    });
  });

  describe('setExhaustionLevel', () => {
    it('sets a level 1-6', () => {
      expect(setExhaustionLevel(null, 3)).toBe(3);
      expect(setExhaustionLevel(2, 6)).toBe(6);
    });

    it('clears when clicking the current level', () => {
      expect(setExhaustionLevel(3, 3)).toBeNull();
    });

    it('clears for out-of-range levels', () => {
      expect(setExhaustionLevel(2, 0)).toBeNull();
      expect(setExhaustionLevel(2, 7)).toBeNull();
    });
  });

  describe('concentrationFromSpellInput', () => {
    it('names the spell when non-empty', () => {
      expect(concentrationFromSpellInput('Bless')).toEqual({ spell: 'Bless' });
    });

    it('trims whitespace', () => {
      expect(concentrationFromSpellInput('  Hold Person  ')).toEqual({ spell: 'Hold Person' });
    });

    it('drops the name but keeps concentrating on empty input', () => {
      expect(concentrationFromSpellInput('')).toEqual({});
      expect(concentrationFromSpellInput('   ')).toEqual({});
    });
  });
});
