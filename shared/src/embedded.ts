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

export interface Combatant {
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  isNpc: boolean;
  notes?: string;
}

export interface HitDice {
  dieType: string;
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
