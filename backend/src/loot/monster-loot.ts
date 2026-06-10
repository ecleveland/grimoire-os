// Monster → loot-template selection (VEG-298). Maps a monster's raw SRD type
// string and real challenge rating onto the shared loot engine's selection
// contract: a normalized type key plus a CR bucket. Pure — no Prisma, no I/O.

import { createFallbackTemplateSelector, LootTemplateSelector } from './loot-template-selector';
import { LootTemplate } from './loot.types';

/** Canonical 5e creature types monster loot templates are keyed by. */
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
 * Fallback key for monster templates without a type match. Same sentinel
 * string the NPC templates use, but in the 'monster' category namespace —
 * the two families never share a template pool.
 */
export const MONSTER_LOOT_GENERIC_TYPE = '__generic__';

/**
 * Normalizes a raw SRD type string ('Dragon (Chromatic)', 'Swarm of Tiny
 * Beasts') to a canonical lowercase type key. Unknown types pass through
 * lowercased so the selector's generic fallback handles them.
 */
export function normalizeMonsterType(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  // Swarms ('Swarm of Tiny Beasts') loot like the creatures composing them.
  if (base.startsWith('swarm of') && base.includes('beast')) return 'beast';
  return base;
}

/**
 * Buckets a real challenge rating into the loot CR buckets. Total over all
 * non-negative CRs — unlike the NPC generator's weighted bucket roll, a
 * monster's bucket is derived, never random.
 */
export function crToBucket(cr: number): string {
  if (cr <= 0) return '0';
  if (cr <= 1) return '0–1';
  if (cr < 5) return '2–4';
  if (cr <= 10) return '5–10';
  return '11+';
}

export type MonsterLootSelection = { selectionKey: string; crBucket: string };

/** The selection inputs the shared LootRoller needs for a given monster. */
export function monsterToLootSelection(monster: {
  type: string;
  challengeRating: number;
}): MonsterLootSelection {
  return {
    selectionKey: normalizeMonsterType(monster.type),
    crBucket: crToBucket(monster.challengeRating),
  };
}

/**
 * Selection strategy over monster-category templates, preserving the shared
 * fallback chain: exact type + bucket → any bucket for the type → generic
 * monster template for the bucket → any generic monster template.
 */
export function createMonsterLootTemplateSelector(
  templates: readonly LootTemplate[]
): LootTemplateSelector {
  return createFallbackTemplateSelector(templates, MONSTER_LOOT_GENERIC_TYPE);
}
