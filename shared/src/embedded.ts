export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface HitPoints {
  max: number;
  current: number;
  temporary: number;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface SpellSlot {
  level: number;
  total: number;
  used: number;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  description?: string;
  weight?: number;
  equipped: boolean;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface Feature {
  name: string;
  source?: string;
  description?: string;
}

/**
 * Where a rolled loot item came from. `profession`/`monster` tag items rolled
 * off an NPC- or monster-category template respectively; `trinket` and
 * `magic-item` come from the engine's bonus rolls (VEG-297/VEG-300).
 */
export type LootItemSource = 'profession' | 'trinket' | 'magic-item' | 'monster';

export interface CombatantLootItem {
  /**
   * Resolved catalog item id (the Item table spans srd/shared/homebrew
   * tiers), or null for flavor entries with no catalog match.
   */
  itemId: string | null;
  name: string;
  quantity: number;
  source: LootItemSource;
  notes?: string;
}

export interface CombatantLootCoinage {
  gp: number;
  sp: number;
  cp: number;
}

/**
 * Loot rolled for a combatant from its source monster (VEG-300). Re-rolling
 * replaces the whole object.
 */
export interface CombatantLoot {
  coinage: CombatantLootCoinage;
  items: CombatantLootItem[];
  rolledAt?: string;
}

export interface Combatant {
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  isNpc: boolean;
  notes?: string;
  /**
   * Optional reference to the SRD monster this combatant was created from
   * (VEG-258). Lets the tracker re-open the source stat block. Manual
   * combatants omit it.
   */
  monsterId?: string;
  /** Loot rolled from the source monster (VEG-300); absent until rolled. */
  loot?: CombatantLoot;
}

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
export type DieType = (typeof DIE_TYPES)[number];

export interface HitDice {
  dieType: DieType;
  total: number;
  spent: number;
}

export interface Weapon {
  name: string;
  attackBonus: string;
  damage: string;
  damageType: string;
  notes?: string;
}
