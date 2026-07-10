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
  const armorType = ARMOR_CATEGORY_TYPES[item.category];
  if (armorType) {
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
  return Array.isArray(value) ? (value as InventoryItem[]) : [];
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
  const armors = equippedGear(inventory, 'armor');

  let base = 10;
  let armorType: ComputedArmorClass['breakdown']['armorType'] = 'unarmored';
  for (const { gear } of armors) {
    if (gear.armorType === 'shield') continue;
    const current = base + dexFor(armorType, dexModifier);
    const candidate = gear.baseArmorClass + dexFor(gear.armorType, dexModifier);
    if (candidate > current) {
      base = gear.baseArmorClass;
      armorType = gear.armorType;
    }
  }

  // Shields don't stack with each other (5e): only the best one counts.
  const shield = armors
    .filter(({ gear }) => gear.armorType === 'shield')
    .reduce((best, { gear }) => Math.max(best, gear.baseArmorClass), 0);

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

function isFinesse(gear: WeaponGear): boolean {
  return gear.properties.some(p => p.toLowerCase().startsWith('finesse'));
}

/**
 * Build weapon attack rows from equipped weapons (VEG-410): Str for melee,
 * Dex for ranged, the higher of the two for Finesse. Proficiency is assumed
 * for v1 — proficiencies are free text, so a reliable match isn't possible;
 * the manual `Character.weapons` path stays the escape hatch. Rows use the
 * stored `Weapon` shape so the sheet's table and roll buttons work unchanged.
 */
export function deriveWeapons(
  inventory: InventoryItem[],
  modifiers: Pick<Record<keyof AbilityScores, number>, 'strength' | 'dexterity'>,
  proficiencyBonus: number
): Weapon[] {
  return equippedGear(inventory, 'weapon').map(({ item, gear }) => {
    const mod = isFinesse(gear)
      ? Math.max(modifiers.strength, modifiers.dexterity)
      : gear.ranged
        ? modifiers.dexterity
        : modifiers.strength;
    return {
      name: item.name,
      attackBonus: formatSigned(mod + proficiencyBonus),
      damage: mod === 0 ? gear.damage : `${gear.damage}${formatSigned(mod)}`,
      damageType: gear.damageType,
      notes: gear.properties.length > 0 ? gear.properties.join(', ') : undefined,
    };
  });
}
