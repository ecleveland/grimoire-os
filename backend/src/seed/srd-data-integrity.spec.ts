import * as fs from 'fs';
import * as path from 'path';
import {
  validateSpellData,
  validateMagicItemData,
  validateSpeciesData,
  validateEquipmentData,
  loadEquipmentFromJson,
  loadMagicItemsFromJson,
} from './srd-json.loader';
import { assertUniqueSeedNames } from './seed-guards';

// Data-integrity guard for the PDF-extracted SRD datasets (VEG-270). Runs the
// generic free-text validators against the REAL committed JSON (no fs mocking),
// mirroring monsters-data-integrity.spec.ts. Its job is two-fold:
//
//   * Prove the guards actually fire on the known-corrupt files. spells.json and
//     magic_items.json were extracted column-blind (VEG-261's root cause) and
//     still carry foreign-title bleed + flattened embedded tables. These specs
//     therefore assert the validators THROW today. When VEG-271 / VEG-272 clean
//     each dataset, flip its `.toThrow()` to `.not.toThrow()` and wire the
//     matching validator into its loader (as loadMonstersFromJson already does).
//
//   * Lock in that species.json is clean. Despite VEG-270's premise, the
//     committed species.json is already well-formed — every lineage/ancestry
//     table (Draconic Ancestors, Elven Lineages, Fiendish Legacies) and option
//     list (Gnome, Goliath) survived extraction intact. This spec keeps it that
//     way; VEG-273 should confirm before assuming a re-extraction is needed.
const JSON_DIR = path.resolve(__dirname, '../../../docs/extracted-srd-json');
const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(JSON_DIR, file), 'utf-8')) as T;

describe('SRD PDF-extracted data integrity', () => {
  describe('spells.json (cleaned by VEG-271)', () => {
    const spells = read<{ spells: Parameters<typeof validateSpellData>[0] }>('spells.json').spells;

    it('contains the full SRD 5.2.1 spell list (339)', () => {
      expect(spells).toHaveLength(339);
    });

    it('passes the free-text guard — bleed stripped and embedded tables reconstructed', () => {
      expect(() => validateSpellData(spells)).not.toThrow();
    });

    it('represents reconstructed tables as GFM markdown (Teleport, Augury)', () => {
      const byName = new Map(spells.map(s => [s.name, s]));
      expect(byName.get('Teleport')?.description).toMatch(
        /\| Familiarity \| Mishap \| Similar Area \| Off Target \| On Target \|/
      );
      expect(byName.get('Augury')?.description).toMatch(/\| Omen \| For Results That Will Be/);
    });
  });

  describe('magic_items.json (cleaned by VEG-272)', () => {
    const items = read<{ magic_items: Parameters<typeof validateMagicItemData>[0] }>(
      'magic_items.json'
    ).magic_items;

    it('contains the full SRD 5.2.1 magic-item roster (257)', () => {
      expect(items).toHaveLength(257);
    });

    it('passes the free-text guard — bleed stripped and embedded tables reconstructed', () => {
      expect(() => validateMagicItemData(items)).not.toThrow();
    });

    it('represents reconstructed tables as GFM markdown (Bag of Tricks, Dragon Scale Mail)', () => {
      const byName = new Map(items.map(i => [i.name, i]));
      expect(byName.get('Bag of Tricks')?.description).toMatch(/\| 1d8 \| Creature \|/);
      expect(byName.get('Dragon Scale Mail')?.description).toMatch(/\| Dragon \| Resistance \|/);
    });

    it('strips the Headband of Intellect interleave garble', () => {
      const headband = items.find(i => i.name === 'Headband of Intellect');
      expect(headband?.description).toContain('19 or higher without it.');
      expect(headband?.description).not.toMatch(/\bon a\b\s*$/);
      expect(headband?.description?.trimEnd()).toMatch(/without it\.$/);
    });
  });

  describe('equipment.json (extracted by VEG-308)', () => {
    const equipment = read<{ equipment: Parameters<typeof validateEquipmentData>[0] }>(
      'equipment.json'
    ).equipment;

    it('contains the full SRD 5.2.1 basic-equipment roster (228)', () => {
      expect(equipment).toHaveLength(228);
    });

    it('covers every chapter category at the expected size', () => {
      const counts: Record<string, number> = {};
      for (const i of equipment) counts[i.category] = (counts[i.category] ?? 0) + 1;
      expect(counts).toEqual({
        'Simple Melee Weapon': 10,
        'Simple Ranged Weapon': 4,
        'Martial Melee Weapon': 18,
        'Martial Ranged Weapon': 6,
        'Light Armor': 3,
        'Medium Armor': 5,
        'Heavy Armor': 4,
        Shield: 1,
        "Artisan's Tools": 17,
        Tool: 6,
        'Gaming Set': 1,
        'Musical Instrument': 1,
        'Adventuring Gear': 70,
        Ammunition: 5,
        'Arcane Focus': 5,
        'Druidic Focus': 3,
        'Holy Symbol': 3,
        'Equipment Pack': 7,
        Mount: 8,
        'Tack, Harness, or Drawn Vehicle': 10,
        'Airborne or Waterborne Vehicle': 7,
        'Lifestyle Expense': 7,
        'Food, Drink, or Lodging': 17,
        Service: 10,
      });
    });

    it('passes the free-text guard', () => {
      expect(() => validateEquipmentData(equipment)).not.toThrow();
    });

    it('has no duplicate names within the file nor against magic_items.json', () => {
      expect(() =>
        assertUniqueSeedNames('item', {
          'equipment.json': equipment.map(i => i.name),
          'magic_items.json': loadMagicItemsFromJson().map(i => i.name),
        })
      ).not.toThrow();
    });

    it('reconciles Potion of Healing to the magic-items dataset only', () => {
      expect(equipment.some(i => i.name === 'Potion of Healing')).toBe(false);
      expect(loadMagicItemsFromJson().some(i => i.name === 'Potions of Healing')).toBe(true);
    });

    it('resolves every pack component to a real equipment item with a positive quantity', () => {
      const names = new Set(equipment.map(i => i.name));
      const packs = equipment.filter(i => i.category === 'Equipment Pack');
      expect(packs).toHaveLength(7);
      for (const pack of packs) {
        expect(pack.contents!.length).toBeGreaterThanOrEqual(7);
        for (const c of pack.contents!) {
          expect(names.has(c.name)).toBe(true);
          expect(c.quantity).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('lists the Burglar’s Pack contents from the PDF, quantities included', () => {
      const burglars = equipment.find(i => i.name === 'Burglar’s Pack');
      expect(burglars?.contents).toContainEqual({ name: 'Candle', quantity: 10 });
      expect(burglars?.contents).toContainEqual({ name: 'Oil', quantity: 7 });
      expect(burglars?.contents).toContainEqual({ name: 'Lantern, Hooded', quantity: 1 });
    });

    it('stores armor AC as self-describing strings per weight class', () => {
      const byName = new Map(equipment.map(i => [i.name, i]));
      expect(byName.get('Padded Armor')?.armor_class).toBe('11 + Dex modifier');
      expect(byName.get('Hide Armor')?.armor_class).toBe('12 + Dex modifier (max 2)');
      expect(byName.get('Plate Armor')?.armor_class).toBe('18');
      expect(byName.get('Shield')?.armor_class).toBe('+2');
      expect(byName.get('Chain Mail')?.strength_requirement).toBe(13);
      expect(byName.get('Chain Mail')?.stealth_disadvantage).toBe(true);
    });

    it('spot-checks entries across categories against the PDF', () => {
      const byName = new Map(equipment.map(i => [i.name, i]));
      expect(byName.get('Longsword')).toMatchObject({
        category: 'Martial Melee Weapon',
        cost: '15 GP',
        weight: 3,
        damage: '1d8',
        damage_type: 'Slashing',
        mastery: 'Sap',
      });
      expect(byName.get('Dart')).toMatchObject({ weight: 0.25, cost: '5 CP' });
      expect(byName.get('Thieves’ Tools')).toMatchObject({ cost: '25 GP', weight: 1 });
      expect(byName.get('Horse, Riding')).toMatchObject({ category: 'Mount', cost: '75 GP' });
      expect(byName.get('Galley')).toMatchObject({ cost: '30,000 GP' });
      expect(byName.get('Wretched Lifestyle')).toMatchObject({ cost: 'Free' });
      expect(byName.get('Spellcasting (Level 9)')).toMatchObject({ cost: '100,000 GP' });
      expect(byName.get('Arrows (20)')).toMatchObject({ category: 'Ammunition', cost: '1 GP' });
    });

    it('loads through loadEquipmentFromJson with every item mundane (isMagic false)', () => {
      const { items, bundles } = loadEquipmentFromJson();
      expect(items).toHaveLength(228);
      expect(items.every(i => i.isMagic === false)).toBe(true);
      expect(bundles).toHaveLength(7);
    });
  });

  describe('species.json (already clean)', () => {
    const species = read<{ species: Parameters<typeof validateSpeciesData>[0] }>(
      'species.json'
    ).species;

    it('contains the full SRD 5.2.1 species roster (9)', () => {
      expect(species).toHaveLength(9);
    });

    it('passes the free-text + table-reference guards with no anomalies', () => {
      expect(() => validateSpeciesData(species)).not.toThrow();
    });
  });
});
