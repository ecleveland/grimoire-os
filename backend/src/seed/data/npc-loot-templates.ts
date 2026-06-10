// Profession + CR-bucket → loot template, used by the NPC generator's
// coinage/loot step. Items reference SRD `Item.name` (resolved to ids at
// generation time). A `__generic__` profession exists per CR bucket as the
// fallback for "Other (custom)" professions.

import { LOOT_CR_BUCKETS, LootCoinage, LootCrBucket } from '../../loot/loot.types';

// The bucket list is owned by the neutral loot layer (shared with the
// monster templates); re-exported here under the historical NPC names.
export const NPC_LOOT_CR_BUCKETS = LOOT_CR_BUCKETS;
export type NpcLootCrBucket = LootCrBucket;

export const NPC_LOOT_PROFESSIONS = [
  'peasant',
  'blacksmith',
  'mercenary',
  'sage',
  'merchant',
  'noble',
  'bandit',
  'guard',
  'priest',
  'scholar',
  'innkeeper',
] as const;

export const NPC_LOOT_GENERIC_PROFESSION = '__generic__';

export type NpcLootCoinage = LootCoinage;

export type NpcLootItemEntry = {
  itemName: string;
  weight: number;
  qty: [number, number];
};

export type NpcLootTemplate = {
  profession: string;
  crBucket: NpcLootCrBucket;
  coinage: NpcLootCoinage;
  items: NpcLootItemEntry[];
};

export const npcLootTemplates: NpcLootTemplate[] = [
  // ── Peasant ────────────────────────────────────────────
  {
    profession: 'peasant',
    crBucket: '0',
    coinage: { gp: [0, 0], sp: [0, 1], cp: [2, 12] },
    items: [
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Quarterstaff', weight: 80, qty: [1, 1] },
      { itemName: 'Sling', weight: 30, qty: [1, 1] },
    ],
  },
  {
    profession: 'peasant',
    crBucket: '0–1',
    coinage: { gp: [0, 1], sp: [1, 4], cp: [4, 16] },
    items: [
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Quarterstaff', weight: 80, qty: [1, 1] },
      { itemName: 'Club', weight: 50, qty: [1, 1] },
    ],
  },

  // ── Blacksmith ─────────────────────────────────────────
  {
    profession: 'blacksmith',
    crBucket: '0',
    coinage: { gp: [0, 1], sp: [2, 6], cp: [4, 16] },
    items: [
      { itemName: 'Hammer', weight: 100, qty: [1, 1] },
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
    ],
  },
  {
    profession: 'blacksmith',
    crBucket: '0–1',
    coinage: { gp: [0, 2], sp: [2, 8], cp: [4, 20] },
    items: [
      { itemName: 'Hammer', weight: 100, qty: [1, 1] },
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Warhammer', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'blacksmith',
    crBucket: '2–4',
    coinage: { gp: [2, 8], sp: [4, 20], cp: [10, 40] },
    items: [
      { itemName: 'Hammer', weight: 100, qty: [1, 1] },
      { itemName: 'Warhammer', weight: 80, qty: [1, 1] },
      { itemName: 'Chain Mail', weight: 30, qty: [1, 1] },
    ],
  },

  // ── Mercenary ──────────────────────────────────────────
  {
    profession: 'mercenary',
    crBucket: '0–1',
    coinage: { gp: [1, 6], sp: [4, 20], cp: [4, 20] },
    items: [
      { itemName: 'Shortsword', weight: 70, qty: [1, 1] },
      { itemName: 'Longsword', weight: 50, qty: [1, 1] },
      { itemName: 'Crossbow, Light', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'mercenary',
    crBucket: '2–4',
    coinage: { gp: [4, 20], sp: [4, 24], cp: [4, 24] },
    items: [
      { itemName: 'Longsword', weight: 80, qty: [1, 1] },
      { itemName: 'Chain Mail', weight: 60, qty: [1, 1] },
      { itemName: 'Crossbow, Heavy', weight: 30, qty: [1, 1] },
    ],
  },
  {
    profession: 'mercenary',
    crBucket: '5–10',
    coinage: { gp: [10, 60], sp: [10, 40], cp: [0, 20] },
    items: [
      { itemName: 'Longsword', weight: 80, qty: [1, 1] },
      { itemName: 'Plate', weight: 40, qty: [1, 1] },
      { itemName: 'Greatsword', weight: 50, qty: [1, 1] },
    ],
  },

  // ── Sage / Scholar ─────────────────────────────────────
  {
    profession: 'sage',
    crBucket: '0',
    coinage: { gp: [1, 4], sp: [2, 12], cp: [2, 12] },
    items: [
      { itemName: 'Quarterstaff', weight: 60, qty: [1, 1] },
      { itemName: 'Dagger', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'sage',
    crBucket: '0–1',
    coinage: { gp: [2, 12], sp: [2, 12], cp: [0, 10] },
    items: [
      { itemName: 'Quarterstaff', weight: 60, qty: [1, 1] },
      { itemName: 'Dagger', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'sage',
    crBucket: '2–4',
    coinage: { gp: [5, 30], sp: [4, 24], cp: [0, 12] },
    items: [
      { itemName: 'Quarterstaff', weight: 60, qty: [1, 1] },
      { itemName: 'Dagger', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'scholar',
    crBucket: '0',
    coinage: { gp: [0, 4], sp: [2, 12], cp: [2, 12] },
    items: [{ itemName: 'Dagger', weight: 50, qty: [1, 1] }],
  },
  {
    profession: 'scholar',
    crBucket: '0–1',
    coinage: { gp: [1, 8], sp: [2, 16], cp: [2, 16] },
    items: [
      { itemName: 'Dagger', weight: 50, qty: [1, 1] },
      { itemName: 'Quarterstaff', weight: 50, qty: [1, 1] },
    ],
  },

  // ── Merchant ───────────────────────────────────────────
  {
    profession: 'merchant',
    crBucket: '0',
    coinage: { gp: [1, 6], sp: [3, 12], cp: [0, 6] },
    items: [{ itemName: 'Dagger', weight: 60, qty: [1, 1] }],
  },
  {
    profession: 'merchant',
    crBucket: '0–1',
    coinage: { gp: [2, 12], sp: [5, 20], cp: [0, 10] },
    items: [
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Shortsword', weight: 30, qty: [1, 1] },
    ],
  },
  {
    profession: 'merchant',
    crBucket: '2–4',
    coinage: { gp: [10, 60], sp: [10, 40], cp: [0, 12] },
    items: [
      { itemName: 'Shortsword', weight: 50, qty: [1, 1] },
      { itemName: 'Leather Armor', weight: 40, qty: [1, 1] },
    ],
  },

  // ── Noble ──────────────────────────────────────────────
  {
    profession: 'noble',
    crBucket: '0–1',
    coinage: { gp: [10, 50], sp: [0, 20], cp: [0, 0] },
    items: [
      { itemName: 'Rapier', weight: 70, qty: [1, 1] },
      { itemName: 'Dagger', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'noble',
    crBucket: '2–4',
    coinage: { gp: [20, 100], sp: [0, 20], cp: [0, 0] },
    items: [
      { itemName: 'Rapier', weight: 80, qty: [1, 1] },
      { itemName: 'Leather Armor', weight: 30, qty: [1, 1] },
    ],
  },
  {
    profession: 'noble',
    crBucket: '5–10',
    coinage: { gp: [50, 300], sp: [0, 40], cp: [0, 0] },
    items: [
      { itemName: 'Rapier', weight: 80, qty: [1, 1] },
      { itemName: 'Plate', weight: 30, qty: [1, 1] },
    ],
  },

  // ── Bandit ─────────────────────────────────────────────
  {
    profession: 'bandit',
    crBucket: '0–1',
    coinage: { gp: [0, 5], sp: [2, 12], cp: [2, 12] },
    items: [
      { itemName: 'Shortsword', weight: 70, qty: [1, 1] },
      { itemName: 'Crossbow, Light', weight: 50, qty: [1, 1] },
      { itemName: 'Leather Armor', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'bandit',
    crBucket: '2–4',
    coinage: { gp: [2, 16], sp: [4, 24], cp: [2, 16] },
    items: [
      { itemName: 'Shortsword', weight: 70, qty: [1, 1] },
      { itemName: 'Longsword', weight: 40, qty: [1, 1] },
      { itemName: 'Studded Leather', weight: 50, qty: [1, 1] },
    ],
  },
  {
    profession: 'bandit',
    crBucket: '5–10',
    coinage: { gp: [10, 60], sp: [10, 40], cp: [2, 16] },
    items: [
      { itemName: 'Longsword', weight: 60, qty: [1, 1] },
      { itemName: 'Chain Mail', weight: 50, qty: [1, 1] },
    ],
  },

  // ── Guard ──────────────────────────────────────────────
  {
    profession: 'guard',
    crBucket: '0–1',
    coinage: { gp: [0, 4], sp: [2, 12], cp: [2, 12] },
    items: [
      { itemName: 'Spear', weight: 80, qty: [1, 1] },
      { itemName: 'Shortsword', weight: 50, qty: [1, 1] },
      { itemName: 'Chain Shirt', weight: 60, qty: [1, 1] },
    ],
  },
  {
    profession: 'guard',
    crBucket: '2–4',
    coinage: { gp: [2, 12], sp: [4, 16], cp: [2, 12] },
    items: [
      { itemName: 'Longsword', weight: 60, qty: [1, 1] },
      { itemName: 'Chain Mail', weight: 70, qty: [1, 1] },
      { itemName: 'Shield', weight: 60, qty: [1, 1] },
    ],
  },

  // ── Priest ─────────────────────────────────────────────
  {
    profession: 'priest',
    crBucket: '0',
    coinage: { gp: [0, 2], sp: [1, 6], cp: [2, 12] },
    items: [{ itemName: 'Quarterstaff', weight: 60, qty: [1, 1] }],
  },
  {
    profession: 'priest',
    crBucket: '0–1',
    coinage: { gp: [1, 6], sp: [2, 12], cp: [2, 12] },
    items: [
      { itemName: 'Quarterstaff', weight: 60, qty: [1, 1] },
      { itemName: 'Mace', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: 'priest',
    crBucket: '2–4',
    coinage: { gp: [2, 16], sp: [2, 16], cp: [0, 12] },
    items: [
      { itemName: 'Mace', weight: 60, qty: [1, 1] },
      { itemName: 'Chain Shirt', weight: 40, qty: [1, 1] },
    ],
  },

  // ── Innkeeper ──────────────────────────────────────────
  {
    profession: 'innkeeper',
    crBucket: '0',
    coinage: { gp: [1, 4], sp: [2, 12], cp: [2, 12] },
    items: [{ itemName: 'Club', weight: 60, qty: [1, 1] }],
  },
  {
    profession: 'innkeeper',
    crBucket: '0–1',
    coinage: { gp: [2, 12], sp: [4, 16], cp: [2, 12] },
    items: [
      { itemName: 'Club', weight: 60, qty: [1, 1] },
      { itemName: 'Dagger', weight: 40, qty: [1, 1] },
    ],
  },

  // ── Generic fallback (one per CR bucket) ───────────────
  {
    profession: NPC_LOOT_GENERIC_PROFESSION,
    crBucket: '0',
    coinage: { gp: [0, 1], sp: [1, 6], cp: [2, 12] },
    items: [{ itemName: 'Dagger', weight: 60, qty: [1, 1] }],
  },
  {
    profession: NPC_LOOT_GENERIC_PROFESSION,
    crBucket: '0–1',
    coinage: { gp: [0, 4], sp: [2, 12], cp: [2, 12] },
    items: [
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Shortsword', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: NPC_LOOT_GENERIC_PROFESSION,
    crBucket: '2–4',
    coinage: { gp: [2, 12], sp: [4, 16], cp: [2, 16] },
    items: [
      { itemName: 'Shortsword', weight: 60, qty: [1, 1] },
      { itemName: 'Leather Armor', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: NPC_LOOT_GENERIC_PROFESSION,
    crBucket: '5–10',
    coinage: { gp: [5, 40], sp: [5, 30], cp: [0, 12] },
    items: [
      { itemName: 'Longsword', weight: 60, qty: [1, 1] },
      { itemName: 'Chain Mail', weight: 40, qty: [1, 1] },
    ],
  },
  {
    profession: NPC_LOOT_GENERIC_PROFESSION,
    crBucket: '11+',
    coinage: { gp: [20, 200], sp: [10, 60], cp: [0, 12] },
    items: [
      { itemName: 'Longsword', weight: 60, qty: [1, 1] },
      { itemName: 'Plate', weight: 40, qty: [1, 1] },
      { itemName: 'Greatsword', weight: 30, qty: [1, 1] },
    ],
  },
];
