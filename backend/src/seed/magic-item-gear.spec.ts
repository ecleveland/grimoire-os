import {
  MAGIC_ITEM_GEAR_OVERLAY,
  applyMagicItemGearOverlay,
  assertMagicItemGearOverlay,
} from './magic-item-gear';
import { loadMagicItemsFromJson } from './srd-json.loader';

// A minimal stand-in for the loaded magic-item row shape the overlay reads.
const shield = (name: string) => ({ name, category: 'Armor', properties: ['Shield'] });

describe('applyMagicItemGearOverlay', () => {
  it('stamps the overlaid armorClass onto a matching item', () => {
    const result = applyMagicItemGearOverlay(shield('Animated Shield'));
    expect(result).toMatchObject({ name: 'Animated Shield', armorClass: '+2' });
  });

  it('returns an unmatched item unchanged (no armorClass added)', () => {
    const item = { name: 'Bag of Holding', category: 'Wondrous Item', properties: [] };
    expect(applyMagicItemGearOverlay(item)).toEqual(item);
    expect(applyMagicItemGearOverlay(item)).not.toHaveProperty('armorClass');
  });

  it('does not resolve a prototype-chain name as an overlay entry', () => {
    const item = { name: 'constructor', category: 'Wondrous Item', properties: [] };
    expect(applyMagicItemGearOverlay(item)).not.toHaveProperty('armorClass');
  });
});

describe('assertMagicItemGearOverlay', () => {
  const allTargets = Object.keys(MAGIC_ITEM_GEAR_OVERLAY).map(shield);

  it('passes when every overlay key is a loaded shield', () => {
    expect(() => assertMagicItemGearOverlay(allTargets)).not.toThrow();
  });

  it('throws when an overlay key matches no loaded item (SRD rename/drift)', () => {
    const missingOne = allTargets.slice(1);
    expect(() => assertMagicItemGearOverlay(missingOne)).toThrow(/missing item/i);
  });

  it('throws when an overlay target is not a shield (recategorized)', () => {
    const recategorized = allTargets.map((t, i) =>
      i === 0 ? { ...t, category: 'Wondrous Item', properties: [] } : t
    );
    expect(() => assertMagicItemGearOverlay(recategorized)).toThrow(/not a shield/i);
  });

  // Drift guard: runs against the REAL docs/extracted-srd-json/magic_items.json
  // (fs is not mocked in this spec), so a re-extraction that renames or
  // recategorizes an overlay-targeted shield fails CI here rather than silently
  // dropping the enrichment at seed time.
  it('matches the real SRD magic-item catalog', () => {
    const items = loadMagicItemsFromJson();
    expect(() => assertMagicItemGearOverlay(items)).not.toThrow();
  });

  it('enriches every overlaid shield with its "+2" AC in the real catalog', () => {
    const byName = new Map(loadMagicItemsFromJson().map(i => [i.name, i]));
    for (const name of Object.keys(MAGIC_ITEM_GEAR_OVERLAY)) {
      expect(byName.get(name)).toMatchObject({ armorClass: '+2' });
    }
  });
});
