// Types shared across the NPC generator pipeline. Public input/output shapes
// the controller and reroll endpoint consume; persisted on Npc.generationParams.

import { NPC_APPEARANCE_CATEGORIES } from '../../seed/data/npc-appearance-traits';
import { GeneratedLoot, GeneratedLootItem, LootOverrides } from '../../loot/loot.types';

// Loot shapes are owned by the shared loot module (VEG-297); re-exported here
// under their historical names so existing NPC-side imports keep working.
export type NpcLootOverrides = LootOverrides;
export type { GeneratedLoot, GeneratedLootItem };

export type NpcHostility = 'friendly' | 'neutral' | 'hostile';

export type NpcGender = 'male' | 'female';

export type NpcGenerationConstraints = {
  campaignId: string;
  seed?: string;
  race?: string;
  setting?: string;
  background?: string;
  profession?: string;
  alignment?: string;
  name?: string;
  gender?: NpcGender;
  hostility?: NpcHostility;
  combatRelevant?: boolean;
  lootOverrides?: NpcLootOverrides;
};

export type NpcAppearanceCategory = (typeof NPC_APPEARANCE_CATEGORIES)[number];

export type GeneratedAppearance = {
  prose: string;
  parts: Partial<Record<NpcAppearanceCategory, string>>;
};

export type GeneratedName = {
  full: string;
  first: string;
  family: string | null;
  gender: NpcGender | null;
};

export type GeneratedPersonality = {
  traits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
};

export type StatBlockAction = {
  name: string;
  description: string;
};

// Mirrors the Prisma `Monster` model shape so the encounter combatant builder
// can ingest both interchangeably. Persisted on Npc.statBlock as JSONB.
export type NpcStatBlock = {
  baseMonster: string;
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string | null;
  armorClass: number;
  armorType: string | null;
  hitPoints: number;
  hitDice: string | null;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: Record<string, number> | null;
  skills: Record<string, number> | null;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string | null;
  languages: string | null;
  challengeRating: number;
  experiencePoints: number | null;
  specialAbilities: StatBlockAction[] | null;
  actions: StatBlockAction[];
  reactions: StatBlockAction[] | null;
  legendaryActions: StatBlockAction[] | null;
  professionWeaponSwap: {
    profession: string;
    weapon: string;
    replacedAction: string;
  } | null;
};

export type NpcGenerationDecisions = {
  race?: string;
  background?: string | null;
  // Persisted alongside the display `background` name so personality resolution
  // is id-first (VEG-481): a name alone is ambiguous once srd/shared tiers can
  // share it. Null when the name has no single matching pool row — a free-typed
  // custom, or a name that collides across tiers with no id to disambiguate it.
  // Absent on decisions persisted before this field existed. Null and absent are
  // treated identically on read (both fall through to the unambiguous-name path).
  backgroundId?: string | null;
  profession?: string | null;
  alignment?: string;
  name?: GeneratedName;
  appearance?: GeneratedAppearance;
  personality?: GeneratedPersonality;
  loot?: GeneratedLoot;
  statBlock?: NpcStatBlock | null;
};

export type NpcGenerationParams = {
  version: 1;
  seed: string;
  constraints: NpcGenerationConstraints;
  decisions: NpcGenerationDecisions;
};

export type GeneratedNpc = {
  campaignId: string;
  name: string;
  race: string;
  background: string | null;
  profession: string | null;
  alignment: string;
  size: string | null;
  age: number | null;
  gender: string | null;
  appearance: string | null;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  statBlock: NpcStatBlock | null;
  goldPieces: number;
  silverPieces: number;
  copperPieces: number;
  loot: GeneratedLootItem[];
  lootOverrides: NpcLootOverrides | null;
  generationParams: NpcGenerationParams;
};

export const REROLL_FIELDS = [
  'race',
  'background',
  'profession',
  'alignment',
  'name',
  'appearance',
  'personality',
  'loot',
  'statBlock',
  'all',
] as const;

export type RerollField = (typeof REROLL_FIELDS)[number];
