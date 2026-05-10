// Static lookup tables for the NPC generator that are not driven by Prisma seed data.

import { NPC_ALIGNMENT_ORDER } from '../../seed/data/npc-alignment-priors';
import { NPC_LOOT_GENERIC_PROFESSION } from '../../seed/data/npc-loot-templates';

export { NPC_ALIGNMENT_ORDER, NPC_LOOT_GENERIC_PROFESSION };

// Curated profession set per Background. Falls back to GENERIC_PROFESSIONS when
// the chosen background isn't mapped, and merges with the generic list so every
// background has a wide enough pool to roll from.
export const PROFESSIONS_BY_BACKGROUND: Record<string, string[]> = {
  Acolyte: ['priest', 'scholar', 'sage'],
  Criminal: ['bandit', 'mercenary'],
  Sage: ['sage', 'scholar', 'scribe'],
  Soldier: ['mercenary', 'guard', 'soldier'],
};

export const GENERIC_PROFESSIONS = [
  'peasant',
  'blacksmith',
  'merchant',
  'innkeeper',
  'farmer',
  'hunter',
  'fisher',
];

// Hostility nudges alignment by re-weighting toward an axis. Multiplicative
// adjustment applied to the base prior weights, indexed by NPC_ALIGNMENT_ORDER.
export const HOSTILITY_ALIGNMENT_BIAS: Record<'friendly' | 'neutral' | 'hostile', number[]> = {
  friendly: [2, 2, 2, 1, 1, 1, 0.5, 0.3, 0.2],
  neutral: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  hostile: [0.2, 0.3, 0.5, 1, 1, 1, 2, 2, 2],
};

// CR buckets the generator will choose from when no explicit CR constraint is set.
// Skews low — most NPCs are non-combatants.
export const DEFAULT_CR_BUCKET_WEIGHTS: { bucket: string; weight: number }[] = [
  { bucket: '0', weight: 60 },
  { bucket: '0–1', weight: 25 },
  { bucket: '2–4', weight: 10 },
  { bucket: '5–10', weight: 4 },
  { bucket: '11+', weight: 1 },
];

// Default age ranges per race, used when the appearance step rolls an age.
// Lower / upper bound roughly match SRD lifespan descriptions.
export const AGE_RANGE_BY_RACE: Record<string, [number, number]> = {
  Human: [18, 75],
  Dwarf: [25, 350],
  Elf: [50, 750],
  Halfling: [20, 150],
  Gnome: [30, 450],
  Dragonborn: [16, 80],
  Goliath: [18, 80],
  Orc: [16, 60],
  Tiefling: [18, 95],
};

export const DEFAULT_AGE_RANGE: [number, number] = [18, 80];

// Genders the name step samples when no gender constraint is supplied.
export const NAME_GENDERS = ['male', 'female'] as const;

export const DEFAULT_ALIGNMENT_WEIGHTS = NPC_ALIGNMENT_ORDER.map(() => 1);

export function alignmentIndex(alignment: string): number {
  return NPC_ALIGNMENT_ORDER.indexOf(alignment as (typeof NPC_ALIGNMENT_ORDER)[number]);
}

// Civilian fallback for the stat block step. When combat-relevance is not
// requested, the generator does not produce a stat block at all; this name
// is the floor when only a civilian-shaped base monster is available.
export const STATBLOCK_CIVILIAN_BASE = 'Commoner';

// Combatant base monsters by CR bucket. The pipeline narrows the pool by
// `Monster.challengeRating` and falls back to wider buckets when empty so a
// sparse `monsters` table never crashes generation.
export const STATBLOCK_COMBATANT_POOLS_BY_BUCKET: Record<string, string[]> = {
  '0': ['Commoner'],
  '0–1': ['Bandit', 'Guard', 'Priest Acolyte', 'Scout'],
  '2–4': ['Spy', 'Bandit Captain', 'Knight', 'Priest', 'Warrior Veteran'],
  '5–10': ['Mage', 'Guard Captain', 'Warrior Veteran'],
  '11+': ['Mage', 'Knight'],
};

// Maps the curated profession dropdown values to a preferred weapon name.
// Used by the stat-block step to swap a base monster's weapon action.
export const PROFESSION_WEAPON: Record<string, string> = {
  blacksmith: 'warhammer',
  hunter: 'longbow',
  soldier: 'longsword',
  guard: 'spear',
  mercenary: 'shortsword',
  bandit: 'scimitar',
  scholar: 'quarterstaff',
  priest: 'mace',
  sage: 'quarterstaff',
};

// Words that identify a weapon-like entry in the base monster's `actions`.
// We swap the first matching action's name + description to the profession
// weapon, preserving stat-block math.
export const STATBLOCK_WEAPON_ACTION_KEYWORDS: readonly string[] = [
  'sword',
  'bow',
  'mace',
  'axe',
  'hammer',
  'dagger',
  'spear',
  'pike',
  'club',
  'staff',
  'rapier',
  'scimitar',
  'crossbow',
  'morningstar',
  'flail',
  'shortbow',
  'longsword',
  'shortsword',
];
