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
