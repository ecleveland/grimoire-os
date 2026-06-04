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
  describe('spells.json (corrupt — cleaned by VEG-271)', () => {
    const spells = read<{ spells: Parameters<typeof validateSpellData>[0] }>('spells.json').spells;

    it('reproduces the known extraction anomalies', () => {
      // Flip to .not.toThrow() in VEG-271 once the spell tables/bleed are fixed.
      expect(() => validateSpellData(spells)).toThrow(/spell data validation failed/);
    });

    it('catches both the foreign-title bleed and flattened-table classes', () => {
      let message = '';
      try {
        validateSpellData(spells);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/Programmed Illusion: description ends with another entry's title/);
      expect(message).toMatch(/Teleport: flattened table/);
    });
  });

  describe('magic_items.json (corrupt — cleaned by VEG-272)', () => {
    const items = read<{ magic_items: Parameters<typeof validateMagicItemData>[0] }>(
      'magic_items.json'
    ).magic_items;

    it('reproduces the known flattened-table anomalies', () => {
      // Flip to .not.toThrow() in VEG-272 once the embedded item tables are fixed.
      expect(() => validateMagicItemData(items)).toThrow(/magic item data validation failed/);
    });

    it('catches a representative flattened embedded table', () => {
      let message = '';
      try {
        validateMagicItemData(items);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/Bag of Tricks: flattened table/);
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
