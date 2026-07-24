import { autoEquipStartingArmor } from './auto-equip';

/** Minimal inventory-line shape the helper reads. */
type Line = {
  name: string;
  quantity: number;
  equipped: boolean;
  gear?: { type: string; armorType?: string; baseArmorClass?: number; armorClassBonus?: number };
};

const bodyArmor = (name: string, baseArmorClass: number, armorType = 'heavy'): Line => ({
  name,
  quantity: 1,
  equipped: false,
  gear: { type: 'armor', armorType, baseArmorClass },
});

const shield = (name = 'Shield'): Line => ({
  name,
  quantity: 1,
  equipped: false,
  gear: { type: 'armor', armorType: 'shield', armorClassBonus: 2 },
});

const weapon = (name: string): Line => ({
  name,
  quantity: 1,
  equipped: false,
  gear: { type: 'weapon' },
});

const plain = (name: string): Line => ({ name, quantity: 1, equipped: false });

/** Names of the lines the helper marked equipped. */
const equippedNames = (items: Line[]): string[] => items.filter(i => i.equipped).map(i => i.name);

describe('autoEquipStartingArmor (VEG-483)', () => {
  it('equips the sole body armor and shield, leaving weapons unequipped', () => {
    const result = autoEquipStartingArmor([
      bodyArmor('Chain Mail', 16),
      shield('Shield'),
      weapon('Longsword'),
    ]);

    expect(equippedNames(result)).toEqual(['Chain Mail', 'Shield']);
  });

  it('equips only the highest-baseArmorClass body armor when several are present', () => {
    const result = autoEquipStartingArmor([
      bodyArmor('Leather', 11, 'light'),
      bodyArmor('Chain Mail', 16),
      bodyArmor('Scale Mail', 14, 'medium'),
    ]);

    expect(equippedNames(result)).toEqual(['Chain Mail']);
  });

  it('keeps the first body armor on an AC tie', () => {
    const result = autoEquipStartingArmor([
      bodyArmor('Ring Mail', 14, 'heavy'),
      bodyArmor('Scale Mail', 14, 'medium'),
    ]);

    expect(equippedNames(result)).toEqual(['Ring Mail']);
  });

  it('equips at most one shield (the first)', () => {
    const result = autoEquipStartingArmor([shield('Shield'), shield('Wooden Shield')]);

    expect(equippedNames(result)).toEqual(['Shield']);
  });

  it('is a no-op when there is no armor or shield', () => {
    const result = autoEquipStartingArmor([weapon('Longsword'), plain('Torch')]);

    expect(equippedNames(result)).toEqual([]);
  });

  it('equips a shield even when no body armor is present', () => {
    const result = autoEquipStartingArmor([shield('Shield'), weapon('Mace')]);

    expect(equippedNames(result)).toEqual(['Shield']);
  });

  it('ignores lines with no gear snapshot', () => {
    const result = autoEquipStartingArmor([
      plain('Chain Mail'),
      bodyArmor('Scale Mail', 14, 'medium'),
    ]);

    // The gear-less "Chain Mail" can't be identified as armor; the snapshotted
    // Scale Mail is the only equippable body armor.
    expect(equippedNames(result)).toEqual(['Scale Mail']);
  });

  it('does not mutate the input array or its items', () => {
    const input = [bodyArmor('Chain Mail', 16), shield('Shield')];
    autoEquipStartingArmor(input);

    expect(input.every(i => i.equipped === false)).toBe(true);
  });

  it('skips a body armor with a non-finite baseArmorClass', () => {
    const junk: Line = {
      name: 'Broken Plate',
      quantity: 1,
      equipped: false,
      gear: { type: 'armor', armorType: 'heavy', baseArmorClass: Number.NaN },
    };
    const result = autoEquipStartingArmor([junk, bodyArmor('Chain Mail', 16)]);

    expect(equippedNames(result)).toEqual(['Chain Mail']);
  });
});
