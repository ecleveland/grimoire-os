import * as fs from 'fs';
import * as path from 'path';
import { validateSpellData, validateMagicItemData, validateSpeciesData } from './srd-json.loader';

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
