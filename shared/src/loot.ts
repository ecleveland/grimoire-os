// Shared loot types: the template shapes the loot engine and admin editors
// both consume (VEG-303) — persisted as JSON columns on NpcLootTemplate —
// plus encounter-loot aggregation (VEG-300), whose aggregate is never
// persisted (derived identically by backend and frontend), which rules out
// drift for that half.

import type { Combatant, CombatantLootCoinage, CombatantLootItem } from './embedded';

/**
 * The CR buckets every loot-template family is keyed by (VEG-303). Note the
 * en-dash (U+2013) in the range labels — an ASCII hyphen never matches a
 * template, so editors must offer these exact values rather than free text.
 */
export const LOOT_CR_BUCKETS = ['0', '0–1', '2–4', '5–10', '11+'] as const;

export type LootCrBucket = (typeof LOOT_CR_BUCKETS)[number];

/**
 * Canonical 5e creature types monster loot templates are keyed by (VEG-298).
 * Owned by the shared package since VEG-304 so the admin editor offers the
 * exact keys the loot engine selects on.
 */
export const MONSTER_LOOT_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;

export type MonsterLootType = (typeof MONSTER_LOOT_TYPES)[number];

/**
 * Fallback key for monster templates without a type match. The sentinel
 * string collides with the NPC one by design, so callers MUST pass only
 * category='monster' templates to the selector — an unfiltered template
 * query would silently mix the two families' generic fallbacks.
 */
export const MONSTER_LOOT_GENERIC_TYPE = '__generic__';

/**
 * The full selectable key set monster loot templates are stored under —
 * what the admin editor offers and the create API accepts.
 */
export const MONSTER_LOOT_TYPE_KEYS = [...MONSTER_LOOT_TYPES, MONSTER_LOOT_GENERIC_TYPE] as const;

export type MonsterLootTypeKey = (typeof MONSTER_LOOT_TYPE_KEYS)[number];

/** Inclusive [min, max] range rolled at generation time. */
export type LootRange = [number, number];

/** Per-denomination coinage ranges stored on a loot template. */
export interface LootTemplateCoinage {
  gp: LootRange;
  sp: LootRange;
  cp: LootRange;
}

/**
 * One weighted item entry on a loot template. `itemName` is the exact catalog
 * `Item.name` — generation resolves it to an id by name, so editors should
 * pick from the catalog rather than accept free text.
 */
export interface LootTemplateItemEntry {
  itemName: string;
  weight: number;
  qty: LootRange;
  /**
   * When `true`, the loot roller may draw this entry more than once in a single
   * roll, merging the repeats into one row with a summed quantity (e.g. "Dagger
   * ×3"). When `false`/omitted (the default), the entry is removed from the pool
   * after its first win so a roll never carries duplicate copies of it. Set on
   * entries where multiples are believable — daggers, throwing weapons.
   */
  allowDuplicate?: boolean;
}

export interface EncounterLootTotal {
  coinage: CombatantLootCoinage;
  items: CombatantLootItem[];
}

/**
 * Sums coinage and merges items across every combatant that has rolled loot.
 * Items merge when itemId, name, source, and notes all match (quantities
 * add); merged items preserve first-seen order. Combatants without loot are
 * ignored. Never mutates its input.
 */
export function aggregateCombatantLoot(
  combatants: readonly Combatant[] | null | undefined
): EncounterLootTotal {
  const coinage: CombatantLootCoinage = { gp: 0, sp: 0, cp: 0 };
  const items = new Map<string, CombatantLootItem>();

  for (const combatant of combatants ?? []) {
    const loot = combatant.loot;
    if (!loot) continue;
    coinage.gp += loot.coinage.gp;
    coinage.sp += loot.coinage.sp;
    coinage.cp += loot.coinage.cp;
    for (const item of loot.items) {
      // Tuple-serialized so item names can never forge a collision with a
      // hand-rolled delimiter.
      const key = JSON.stringify([item.itemId, item.name, item.source, item.notes ?? null]);
      const existing = items.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        items.set(key, { ...item });
      }
    }
  }

  return { coinage, items: [...items.values()] };
}
