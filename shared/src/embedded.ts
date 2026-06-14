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

/**
 * The SRD on/off conditions a combatant can carry (VEG-287). Names match the
 * seeded `Condition` table so the tracker chips and the (future) rules-text
 * lookup share one vocabulary. Exhaustion is intentionally excluded: it's a
 * 1–6 level track (`Combatant.exhaustion`), not an on/off tag — modelling it as
 * a chip here would let a combatant hold contradictory levels.
 */
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

export type Condition = (typeof CONDITIONS)[number];

/**
 * Concentration tracking (VEG-287). The object's presence means the combatant
 * is concentrating; `spell` optionally names what, so the DM knows which spell
 * a failed concentration save would drop. Absent means not concentrating.
 */
export interface CombatantConcentration {
  spell?: string;
}

export interface Combatant {
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  /**
   * Temporary hit points (VEG-286). Damage spends these before real HP; new
   * grants don't stack — the higher value wins, per 5e. Absent means 0.
   */
  tempHp?: number;
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
  /** Active SRD conditions (VEG-287); absent or empty means none. */
  conditions?: Condition[];
  /** Concentration tracking (VEG-287); absent means not concentrating. */
  concentration?: CombatantConcentration;
  /**
   * Exhaustion level 1–6 (VEG-287); absent (or 0) means none. A level track
   * rather than an on/off condition, so it lives outside `conditions`.
   */
  exhaustion?: number;
  /**
   * Death-saving throws for a downed PC (VEG-288); absent until tracked and
   * cleared on revival above 0 HP. Only meaningful for `isNpc: false`.
   */
  deathSaves?: DeathSaves;
  /**
   * Challenge rating of the source monster (VEG-362), snapshotted at add/link
   * time so the encounter-difficulty readout can sum CR without re-fetching the
   * stat block. Set on monster combatants; absent on PCs, hand-typed NPCs, and
   * DM-controlled allies. Presence of `cr`/`xp` is what marks a combatant as a
   * threat for the difficulty totals (not the broader `isNpc` flag).
   */
  cr?: number;
  /**
   * Experience-point value of the source monster (VEG-362), snapshotted at
   * add/link time (the monster's own `experiencePoints` when present, else the
   * canonical CR→XP value). Lets a homebrew monster keep its custom XP. Set
   * alongside `cr`.
   */
  xp?: number;
  /**
   * Character level snapshotted from the PC's sheet at add time (VEG-362), so
   * the difficulty budget can be computed from the encounter's own PCs. Set on
   * party combatants; absent on monsters and hand-typed PCs.
   */
  level?: number;
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
