// Monster → loot-template selection (VEG-298). Maps a monster's raw SRD type
// string and real challenge rating onto the shared loot engine's selection
// contract: a normalized type key plus a CR bucket. Pure — no Prisma, no I/O.

import { MONSTER_LOOT_GENERIC_TYPE } from '@grimoire-os/shared';
import { createFallbackTemplateSelector, LootTemplateSelector } from './loot-template-selector';
import { LootCrBucket, LootTemplate } from './loot.types';

// The type keys and generic-fallback sentinel are owned by the shared package
// (VEG-304) so the admin editor offers the exact keys the engine selects on.
export { MONSTER_LOOT_TYPES, MONSTER_LOOT_GENERIC_TYPE } from '@grimoire-os/shared';
export type { MonsterLootType } from '@grimoire-os/shared';

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
 * finite CRs (negatives clamp to '0'); throws on NaN/Infinity rather than
 * silently picking a bucket. Unlike the NPC generator's weighted bucket
 * roll, a monster's bucket is derived, never random.
 */
export function crToBucket(cr: number): LootCrBucket {
  if (!Number.isFinite(cr)) {
    throw new Error(`crToBucket: invalid challenge rating ${cr}`);
  }
  if (cr <= 0) return '0';
  if (cr <= 1) return '0–1';
  if (cr < 5) return '2–4';
  if (cr <= 10) return '5–10';
  return '11+';
}

export type MonsterLootSelection = { selectionKey: string; crBucket: LootCrBucket };

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
