import { gearMetaFromItem } from '@grimoire-os/shared';
import { srdClasses } from '../../seed/data/classes';
import { loadEquipmentFromJson } from '../../seed/srd-json.loader';
import { buildItemNameIndex, lookupItemByName, ResolvableItem } from './item-name-match';

/**
 * Reconciles the hand-authored starting-equipment names in `seed/data/classes.ts`
 * against the extracted SRD catalog (VEG-462).
 *
 * The two drifted silently for a long time — "Chain mail" vs "Chain Mail",
 * "Dungeoneer's pack" vs "Dungeoneer’s Pack" — which is exactly why a Fighter's
 * armor never carried a gear snapshot. These tests fail loudly in both
 * directions so the drift can't come back:
 *
 *  - a seed name that stops resolving and isn't on the allowlist = data rot
 *  - an allowlisted name that starts resolving = a stale allowlist entry
 */

/**
 * Equipment lines that intentionally carry no catalog link. Player-choice
 * placeholders ("Any martial weapon"), multi-variant families the SRD models
 * as a category rather than an item (focus/instrument), ammunition the catalog
 * sells in bundles ("Arrows (20)"), and names with no catalog row at all.
 *
 * None of these are gear-relevant: `gearMetaFromItem` maps every one to null,
 * so an unresolved line here costs a catalog link, never a derived stat.
 */
const EXPECTED_UNRESOLVABLE = [
  'Any martial melee weapon',
  'Any martial weapon',
  'Any simple melee weapon',
  'Any simple weapon',
  'Any musical instrument',
  'Arcane focus',
  'Arrow',
  'Crossbow bolt',
  'Druidic focus',
  'Holy symbol',
  'Lute',
  'Spellbook',
];

type EquipmentLine = { name: string; quantity: number };
type EquipmentBundle = { items: EquipmentLine[] };
type EquipmentChoices = {
  guaranteed?: EquipmentLine[];
  choices?: { choose: number; from: EquipmentBundle[] }[];
};

function startingEquipmentNames(): string[] {
  const names = new Set<string>();
  for (const cls of srdClasses) {
    const equip = (cls as { equipmentChoices?: EquipmentChoices }).equipmentChoices;
    if (!equip) continue;
    for (const line of equip.guaranteed ?? []) names.add(line.name);
    for (const choice of equip.choices ?? []) {
      for (const bundle of choice.from) {
        for (const line of bundle.items) names.add(line.name);
      }
    }
  }
  return [...names].sort();
}

describe('starting equipment ↔ catalog reconciliation (VEG-462)', () => {
  const catalog = loadEquipmentFromJson().items as unknown as ResolvableItem[];
  const index = buildItemNameIndex(catalog);
  const names = startingEquipmentNames();

  const resolves = (name: string) => lookupItemByName(index, name) !== undefined;

  it('finds starting equipment to reconcile', () => {
    // Guards the traversal itself: a shape change in `srdClasses` that made
    // startingEquipmentNames() return [] would otherwise make every
    // assertion below vacuously pass.
    expect(names.length).toBeGreaterThan(20);
  });

  it('resolves every seed name that is not explicitly allowlisted', () => {
    const unresolved = names.filter(n => !resolves(n) && !EXPECTED_UNRESOLVABLE.includes(n));

    expect(unresolved).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const nowResolving = EXPECTED_UNRESOLVABLE.filter(resolves);

    expect(nowResolving).toEqual([]);
  });

  it('allowlists only names the seed actually uses', () => {
    const unused = EXPECTED_UNRESOLVABLE.filter(n => !names.includes(n));

    expect(unused).toEqual([]);
  });

  it.each(['Chain mail', 'Leather armor', 'Scale mail', 'Shield', 'Wooden shield'])(
    'snapshots armor stats for %p, so derived AC is reachable from a fresh build',
    armor => {
      // Assert the snapshot, not just the catalog hit: resolution is necessary
      // but not sufficient. `gearMetaFromItem` returns null for armor whose AC
      // text is signed or unparseable, so a re-extraction that turned an AC
      // into "+1" or "special" would keep a resolves()-only test green while
      // silently restoring the exact bug VEG-462 fixes.
      const match = lookupItemByName(index, armor);
      expect(match).toBeDefined();
      expect(gearMetaFromItem(match!)).toMatchObject({ type: 'armor' });
    }
  );
});
