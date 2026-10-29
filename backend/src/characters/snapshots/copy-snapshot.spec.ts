import { buildCopyInput } from './copy-snapshot';

// A stored sheet caught mid-fight, so every reset has something to undo.
const midFight = (): Record<string, unknown> => ({
  name: 'Thorn Ironforge',
  class: 'Fighter',
  classId: 'cls-srd-fighter',
  backgroundId: 'bg-srd-soldier',
  level: 5,
  heroicInspiration: true,
  hitPoints: { max: 44, current: 9, temporary: 5 },
  hitDice: { dieType: 'd10', total: 5, spent: 3 },
  deathSaves: { successes: 1, failures: 2 },
  spellSlots: [
    { level: 1, total: 4, used: 3 },
    { level: 2, total: 2, used: 2 },
  ],
  resources: [{ name: 'Second Wind', max: 1, used: 1, recharge: 'short' }],
  conditions: ['Poisoned', 'Prone'],
  concentration: { spell: 'Bless' },
  exhaustion: 2,
  inventory: [{ name: 'Longsword', quantity: 1, equipped: true }],
  currency: { cp: 0, sp: 3, ep: 0, gp: 50, pp: 0 },
  features: [{ name: 'Second Wind', source: 'Fighter', description: 'Heal' }],
  feats: [{ name: 'Alert' }],
});

describe('buildCopyInput', () => {
  it('names the copy after the stored name and the snapshot level (VEG-646)', () => {
    expect(buildCopyInput(midFight(), 5).name).toBe('Thorn Ironforge (level 5)');
  });

  it('uses a supplied name over the default (VEG-646)', () => {
    expect(buildCopyInput(midFight(), 5, 'Thorn the Second').name).toBe('Thorn the Second');
  });

  it('heals to max and drops temporary hit points (VEG-646)', () => {
    expect(buildCopyInput(midFight(), 5).hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('restores spent hit dice and clears death saves (VEG-646)', () => {
    const copy = buildCopyInput(midFight(), 5);

    expect(copy.hitDice).toEqual({ dieType: 'd10', total: 5, spent: 0 });
    expect(copy.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('restores every spell slot and resource use (VEG-646)', () => {
    const copy = buildCopyInput(midFight(), 5);

    expect(copy.spellSlots).toEqual([
      { level: 1, total: 4, used: 0 },
      { level: 2, total: 2, used: 0 },
    ]);
    expect(copy.resources).toEqual([{ name: 'Second Wind', max: 1, used: 0, recharge: 'short' }]);
  });

  it('clears conditions, concentration and exhaustion (VEG-646)', () => {
    const copy = buildCopyInput(midFight(), 5);

    expect(copy.conditions).toEqual([]);
    expect(copy.concentration).toBeNull();
    expect(copy.exhaustion).toBeNull();
  });

  it('leaves null hit points, hit dice, death saves, slots and resources null (VEG-646)', () => {
    const copy = buildCopyInput(
      {
        ...midFight(),
        hitPoints: null,
        hitDice: null,
        deathSaves: null,
        spellSlots: null,
        resources: null,
      },
      5
    );

    expect(copy).toMatchObject({
      hitPoints: null,
      hitDice: null,
      deathSaves: null,
      spellSlots: null,
      resources: null,
    });
  });

  it('copies everything else verbatim (VEG-646)', () => {
    const stored = midFight();

    const copy = buildCopyInput(stored, 5);

    for (const key of [
      'class',
      'classId',
      'backgroundId',
      'level',
      'heroicInspiration',
      'inventory',
      'currency',
      'features',
      'feats',
    ]) {
      expect(copy[key]).toEqual(stored[key]);
    }
  });

  it('drops the columns a snapshot omits, version included (VEG-646)', () => {
    const copy = buildCopyInput(
      { ...midFight(), id: 'old-id', userId: 'old-user', campaignId: 'old-camp', version: 3 },
      5
    );

    for (const key of ['id', 'userId', 'campaignId', 'version', 'createdAt', 'updatedAt']) {
      expect(copy).not.toHaveProperty(key);
    }
  });

  it('leaves the stored data unchanged (VEG-646)', () => {
    const stored = midFight();
    const before = structuredClone(stored);

    buildCopyInput({ ...stored, version: 3 }, 5, 'Other');

    expect(stored).toEqual(before);
  });
});
