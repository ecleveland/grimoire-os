// VEG-460: the SRD magic-item catalog (docs/extracted-srd-json/magic_items.json)
// files armor and weapons with null combat stats, so `gearMetaFromItem` can't
// derive AC or attacks for them. This name-keyed overlay stamps the cleanly-
// derivable subset onto the loaded rows at seed time.
//
// Scope (VEG-460): fixed-base magic *shields* only. A shield's AC contribution
// is a flat "+2" bonus (`deriveArmorClass` treats a shield's baseArmorClass as a
// bonus), so these are fully representable in the current model. Magic weapons
// and "+N" body armor are deliberately left unenriched — a "+1 weapon" needs a
// magic-bonus + proficiency-tier model this ticket doesn't add (deferred to
// VEG-461), and "+N" body armor is meaningless without the base armor it
// enchants. The inventory picker surfaces a "no derivable stats" hint for them.

export interface MagicItemGearOverlay {
  /** Self-describing AC text merged onto the item, e.g. "+2" for a shield. */
  armorClass?: string;
}

// Keyed by exact magic-item name. Each value is the shield's *unconditional* AC
// contribution in SRD 5.2.1: "+2" for an ordinary shield whose magic is non-AC
// (animation, missile attraction, spell guarding, …), and "+4" for Shield of the
// Cavalier, whose "+2 to AC ... in addition to the Shield's normal bonus" is an
// always-on bonus that stacks with the base. Conditional AC (Arrow-Catching
// Shield's +2 only vs ranged attacks) and non-AC magic are deliberately omitted
// — the manual AC override covers those. The generic "Shield, +1, +2, or +3"
// variant is excluded — like "Armor, +1, +2, or +3", it names no single bonus.
export const MAGIC_ITEM_GEAR_OVERLAY: Record<string, MagicItemGearOverlay> = {
  'Animated Shield': { armorClass: '+2' },
  'Arrow-Catching Shield': { armorClass: '+2' },
  'Sentinel Shield': { armorClass: '+2' },
  'Shield of Missile Attraction': { armorClass: '+2' },
  'Shield of the Cavalier': { armorClass: '+4' },
  'Spellguard Shield': { armorClass: '+2' },
};

interface OverlayTargetItem {
  name: string;
  category: string;
  properties?: string[];
}

/**
 * Merge the overlay's stats onto a magic item by exact name, returning the item
 * unchanged when it has no overlay entry. Overlay fields win over the item's.
 */
export function applyMagicItemGearOverlay<T extends OverlayTargetItem>(item: T): T {
  // Object.hasOwn guards against a magic-item literally named "constructor"
  // resolving a prototype member as its overlay.
  if (!Object.hasOwn(MAGIC_ITEM_GEAR_OVERLAY, item.name)) return item;
  return { ...item, ...MAGIC_ITEM_GEAR_OVERLAY[item.name] };
}

/**
 * Drift guard: assert every overlay key still matches a loaded magic shield
 * (category "Armor", subcategory "Shield", surfaced as properties ["Shield"]).
 * A re-extraction that renames or recategorizes a targeted item would otherwise
 * silently drop its enrichment. Run by magic-item-gear.spec.ts against the real
 * catalog, so drift fails CI pre-merge rather than the seed itself — the loader
 * can't call this without coupling its mocked unit fixtures to this overlay
 * list, and the production degrade is safe (a drifted shield stops deriving,
 * never derives wrong).
 */
export function assertMagicItemGearOverlay(items: OverlayTargetItem[]): void {
  const byName = new Map(items.map(i => [i.name, i]));
  for (const name of Object.keys(MAGIC_ITEM_GEAR_OVERLAY)) {
    const item = byName.get(name);
    if (!item) {
      throw new Error(`Magic-item gear overlay references a missing item: "${name}"`);
    }
    if (item.category !== 'Armor' || !(item.properties ?? []).includes('Shield')) {
      throw new Error(
        `Magic-item gear overlay target "${name}" is not a shield ` +
          '(expected category "Armor" with subcategory "Shield")'
      );
    }
  }
}
