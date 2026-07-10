// ── Equipment → derived stats (VEG-410) ────────────────────────────────
//
// One shared implementation of (a) mapping a catalog item's self-describing
// fields into structured `GearMeta` at add time and (b) deriving AC / weapon
// attack rows from equipped inventory at read time. Lives here (like
// `computeXpBand`) so the frontend picker, the backend compute layer, and the
// frontend test fixtures can never drift from each other.

import type {
  AbilityScores,
  ArmorGear,
  GearMeta,
  InventoryItem,
  Weapon,
  WeaponGear,
} from './embedded';
import type { ComputedArmorClass } from './computed';

/**
 * Structural subset of a catalog item the gear mapper reads — satisfied by
 * both the API's `SrdItem` shape and the Prisma `Item` row, so either side
 * can snapshot.
 */
export interface GearSourceItem {
  category: string;
  /** Self-describing armor AC text: "11 + Dex modifier", "16", "+2". */
  armorClass?: string | null;
  damage?: string | null;
  damageType?: string | null;
  properties?: string[];
  stealthDisadvantage?: boolean | null;
  strengthRequirement?: number | null;
}

const ARMOR_CATEGORY_TYPES: Record<string, ArmorGear['armorType']> = {
  'Light Armor': 'light',
  'Medium Armor': 'medium',
  'Heavy Armor': 'heavy',
  Shield: 'shield',
};

/** 5e default shield bonus, used when a shield row has no AC text of its own. */
const DEFAULT_SHIELD_BONUS = 2;

/**
 * The catalog AC string's leading integer. That's all the derivation needs:
 * the Dex rule follows from the armor *category*, never from parsing the
 * natural-language remainder ("… + Dex modifier (max 2)"), and a multi-tier
 * string ("12/13/14/15 …") resolves to its first tier.
 */
function leadingInt(text: string): number | null {
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
}

/**
 * Map a catalog item to the gear metadata an inventory snapshot carries, or
 * null when the item contributes nothing to derived stats (tools, packs,
 * unparseable armor). Weapons need both damage fields; `ranged` comes from
 * the category name since properties don't encode it.
 */
export function gearMetaFromItem(item: GearSourceItem): GearMeta | null {
  // Own-property lookup: homebrew categories are free text, so "constructor"
  // must not resolve Object.prototype members into an armorType.
  const armorType = Object.prototype.hasOwnProperty.call(ARMOR_CATEGORY_TYPES, item.category)
    ? ARMOR_CATEGORY_TYPES[item.category]
    : undefined;
  if (armorType) {
    // A signed AC string is a bonus/penalty, not a base — leadingInt strips
    // the sign, so "+1" body armor would snapshot base 1 (AC ~3) and a cursed
    // "-1" shield would snapshot +1. Only the shield "+N" bonus form is
    // representable; everything else signed degrades to no snapshot (the
    // manual override covers it).
    if (item.armorClass && /^\s*-/.test(item.armorClass)) return null;
    if (armorType !== 'shield' && item.armorClass && /^\s*\+/.test(item.armorClass)) {
      return null;
    }
    const parsed = item.armorClass ? leadingInt(item.armorClass) : null;
    const baseArmorClass = parsed ?? (armorType === 'shield' ? DEFAULT_SHIELD_BONUS : null);
    if (baseArmorClass === null) return null;
    const meta: ArmorGear = { type: 'armor', armorType, baseArmorClass };
    if (item.stealthDisadvantage) meta.stealthDisadvantage = true;
    if (item.strengthRequirement != null) meta.strengthRequirement = item.strengthRequirement;
    return meta;
  }

  if (item.category.endsWith('Weapon')) {
    if (!item.damage || !item.damageType) return null;
    return {
      type: 'weapon',
      damage: item.damage,
      damageType: item.damageType,
      properties: item.properties ?? [],
      ranged: item.category.includes('Ranged'),
    };
  }

  return null;
}

/**
 * Guard a JSON-column value into an inventory array. The column is typed
 * `Json?` server-side, so a hand-imported or legacy row can hold a non-array —
 * which would turn every derivation (and thus every character read) into a
 * crash. A non-array simply contributes no gear.
 */
export function inventoryFromJson(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) return [];
  // Element-level guard too: one null/scalar element in a hand-imported row
  // must not crash every character and campaign-roster read downstream.
  return value.filter((el): el is InventoryItem => typeof el === 'object' && el !== null);
}

function equippedGear<T extends GearMeta['type']>(
  inventory: InventoryItem[],
  type: T
): { item: InventoryItem; gear: Extract<GearMeta, { type: T }> }[] {
  return inventory.flatMap(item =>
    item.equipped && item.gear?.type === type
      ? [{ item, gear: item.gear as Extract<GearMeta, { type: T }> }]
      : []
  );
}

/** Dex actually applied for an armor type: full / capped at +2 / none. A
 * negative modifier always applies in full — the medium cap is an upper bound. */
function dexFor(armorType: ArmorGear['armorType'] | 'unarmored', dexModifier: number): number {
  if (armorType === 'heavy') return 0;
  if (armorType === 'medium') return Math.min(dexModifier, 2);
  return dexModifier;
}

/**
 * Derive AC from equipped armor (VEG-410): best body armor's base + Dex per
 * its type (unarmored 10 + Dex fallback), plus the best equipped shield.
 * "Best" is by resulting AC, so a high-Dex character in studded leather isn't
 * out-scored by a forgotten equipped breastplate. `override` (the stored
 * `Character.armorClass` column) wins when set.
 */
export function deriveArmorClass(
  inventory: InventoryItem[],
  dexModifier: number,
  override: number | null
): ComputedArmorClass {
  // A corrupt snapshot (baseArmorClass persisted as a string by an
  // out-of-band write) must not string-concatenate into the AC; it simply
  // contributes nothing, like any other unusable gear.
  const armors = equippedGear(inventory, 'armor').filter(({ gear }) =>
    Number.isFinite(gear.baseArmorClass)
  );

  // Worn body armor always wins over the unarmored 10 + Dex baseline (5e:
  // wearing armor means using its calculation, even when that's worse); the
  // baseline applies only when no body armor is equipped. Among several
  // equipped body armors, the highest resulting AC counts.
  let best: { base: number; armorType: ArmorGear['armorType'] } | null = null;
  for (const { gear } of armors) {
    if (gear.armorType === 'shield') continue;
    const candidate = gear.baseArmorClass + dexFor(gear.armorType, dexModifier);
    if (!best || candidate > best.base + dexFor(best.armorType, dexModifier)) {
      best = { base: gear.baseArmorClass, armorType: gear.armorType };
    }
  }
  const base = best?.base ?? 10;
  const armorType: ComputedArmorClass['breakdown']['armorType'] = best?.armorType ?? 'unarmored';

  // Shields don't stack with each other (5e): only the best one counts.
  const shield = armors
    .filter(({ gear }) => gear.armorType === 'shield')
    .reduce((bestShield, { gear }) => Math.max(bestShield, gear.baseArmorClass), 0);

  const dexApplied = dexFor(armorType, dexModifier);
  const derived = base + dexApplied + shield;
  return {
    derived,
    override,
    effective: override ?? derived,
    breakdown: { base, dexApplied, shield, armorType },
  };
}

/** "+N" / "-N" modifier formatting — the one shared implementation. */
export function formatSigned(value: number): string {
  return value < 0 ? String(value) : `+${value}`;
}

/**
 * floor((score - 10) / 2) — the canonical 5e ability modifier, shared so the
 * backend compute layer, the campaign-roster AC resolution, and the frontend
 * previews/fixtures all feed the derivations from one formula.
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * A hand-edited/out-of-band row may hold anything where the properties array
 * should be — a bare string, numbers in the array. Same posture as the
 * baseArmorClass and inventory guards: degrade to what's usable, never crash
 * a read.
 */
function propertiesOf(gear: WeaponGear): string[] {
  return Array.isArray(gear.properties)
    ? gear.properties.filter((p): p is string => typeof p === 'string')
    : [];
}

function isFinesse(gear: WeaponGear): boolean {
  return propertiesOf(gear).some(p => p.toLowerCase().startsWith('finesse'));
}

/** Trim/casefold key for the derived-vs-manual weapon shadow match. */
function weaponKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Build weapon attack rows from equipped weapons (VEG-410): Str for melee,
 * Dex for ranged, the higher of the two for Finesse. Proficiency is assumed
 * for v1 — proficiencies are free text, so a reliable match isn't possible;
 * the manual `Character.weapons` path stays the escape hatch. Rows use the
 * stored `Weapon` shape so the sheet's table and roll buttons work unchanged.
 *
 * An equipped weapon whose name matches a `manualWeapons` entry derives no
 * row: the player's own entry may carry bonuses (magic, fighting style) the
 * derivation can't know about, and a duplicate row would offer a second,
 * silently-weaker attack button.
 */
export function deriveWeapons(
  inventory: InventoryItem[],
  modifiers: Pick<Record<keyof AbilityScores, number>, 'strength' | 'dexterity'>,
  proficiencyBonus: number,
  manualWeapons: Weapon[] = []
): Weapon[] {
  // Both name sources come out of Json columns guarded only for array-ness,
  // so a null / name-less element must degrade (skip), not crash the read.
  const manualNames = new Set(
    manualWeapons.flatMap(w => (typeof w?.name === 'string' ? [weaponKey(w.name)] : []))
  );
  return equippedGear(inventory, 'weapon')
    .filter(
      ({ item, gear }) =>
        // A row needs a usable name and damage pair to render as anything but
        // literal "undefined" — unusable snapshots contribute nothing.
        typeof item.name === 'string' &&
        typeof gear.damage === 'string' &&
        typeof gear.damageType === 'string' &&
        !manualNames.has(weaponKey(item.name))
    )
    .map(({ item, gear }) => {
      const mod = isFinesse(gear)
        ? Math.max(modifiers.strength, modifiers.dexterity)
        : gear.ranged
          ? modifiers.dexterity
          : modifiers.strength;
      const properties = propertiesOf(gear);
      return {
        name: item.name,
        attackBonus: formatSigned(mod + proficiencyBonus),
        damage: mod === 0 ? gear.damage : `${gear.damage}${formatSigned(mod)}`,
        damageType: gear.damageType,
        notes: properties.length > 0 ? properties.join(', ') : undefined,
      };
    });
}
