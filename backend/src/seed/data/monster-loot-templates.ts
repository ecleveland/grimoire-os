// Monster type + CR-bucket → loot template (VEG-298), the monster-category
// counterpart to npc-loot-templates. Same table and JSON shapes; the `type`
// field lands in the NpcLootTemplate.profession column (the selection key)
// with category='monster'. Items that match an SRD `Item.name` resolve to
// item ids at roll time; flavor entries (hides, fragments, grave goods)
// intentionally resolve to itemId=null and keep their descriptive name.
//
// Flavor guidance (from the ticket): beasts/oozes/plants carry little or
// nothing; undead/constructs yield grave goods / fragments and modest coin;
// dragons/fiends/giants get richer hoards at high CR; humanoids borrow from
// the NPC arsenal. Within a type, list the most representative bucket FIRST —
// the shared fallback chain picks the first entry for the type when the
// exact bucket is missing. That convention only holds for this in-memory
// array: any loader that round-trips these rows through the database MUST
// impose a deterministic order (Postgres row order without ORDER BY is
// unspecified) — e.g. orderBy crBucket ascending, which keeps the poorest
// bucket as the fallback.

import { MONSTER_LOOT_GENERIC_TYPE, MonsterLootType } from '../../loot/monster-loot';
import { LootCoinage, LootCrBucket, LootTemplateItem } from '../../loot/loot.types';

export type MonsterLootTemplate = {
  type: MonsterLootType | typeof MONSTER_LOOT_GENERIC_TYPE;
  crBucket: LootCrBucket;
  coinage: LootCoinage;
  items: LootTemplateItem[];
};

const NO_COIN: LootCoinage = { gp: [0, 0], sp: [0, 0], cp: [0, 0] };

export const monsterLootTemplates: MonsterLootTemplate[] = [
  // ── Generic monster fallback (one per bucket) ───────────────────────────
  {
    type: MONSTER_LOOT_GENERIC_TYPE,
    crBucket: '0',
    coinage: { gp: [0, 0], sp: [0, 1], cp: [0, 8] },
    items: [],
  },
  {
    type: MONSTER_LOOT_GENERIC_TYPE,
    crBucket: '0–1',
    coinage: { gp: [0, 1], sp: [0, 5], cp: [2, 12] },
    items: [],
  },
  {
    type: MONSTER_LOOT_GENERIC_TYPE,
    crBucket: '2–4',
    coinage: { gp: [1, 6], sp: [2, 12], cp: [5, 20] },
    items: [{ itemName: 'Curious Trophy', weight: 30, qty: [1, 1] }],
  },
  {
    type: MONSTER_LOOT_GENERIC_TYPE,
    crBucket: '5–10',
    coinage: { gp: [5, 25], sp: [5, 30], cp: [0, 20] },
    items: [{ itemName: 'Curious Trophy', weight: 40, qty: [1, 1] }],
  },
  {
    type: MONSTER_LOOT_GENERIC_TYPE,
    crBucket: '11+',
    coinage: { gp: [25, 120], sp: [10, 60], cp: [0, 0] },
    items: [{ itemName: 'Curious Trophy', weight: 50, qty: [1, 2] }],
  },

  // ── Aberration: alien oddments, modest coin from victims ────────────────
  {
    type: 'aberration',
    crBucket: '2–4',
    coinage: { gp: [0, 5], sp: [2, 10], cp: [0, 10] },
    items: [
      { itemName: 'Strange Ichor Vial', weight: 50, qty: [1, 1] },
      { itemName: 'Alien Carapace Shard', weight: 40, qty: [1, 2] },
    ],
  },
  {
    type: 'aberration',
    crBucket: '5–10',
    coinage: { gp: [4, 20], sp: [5, 25], cp: [0, 0] },
    items: [
      { itemName: 'Strange Ichor Vial', weight: 50, qty: [1, 2] },
      { itemName: 'Dreamer’s Eye Crystal', weight: 25, qty: [1, 1] },
    ],
  },
  {
    type: 'aberration',
    crBucket: '11+',
    coinage: { gp: [20, 80], sp: [10, 40], cp: [0, 0] },
    items: [
      { itemName: 'Dreamer’s Eye Crystal', weight: 45, qty: [1, 2] },
      { itemName: 'Alien Carapace Shard', weight: 35, qty: [1, 3] },
    ],
  },

  // ── Beast: hide, fang, feather — no gold, a few silver at most ───────────
  {
    type: 'beast',
    crBucket: '0',
    coinage: NO_COIN,
    items: [{ itemName: 'Pelt Scrap', weight: 30, qty: [1, 1] }],
  },
  {
    type: 'beast',
    crBucket: '0–1',
    coinage: { gp: [0, 0], sp: [0, 1], cp: [0, 0] },
    items: [
      { itemName: 'Animal Hide', weight: 50, qty: [1, 1] },
      { itemName: 'Sharp Fang', weight: 35, qty: [1, 2] },
    ],
  },
  {
    type: 'beast',
    crBucket: '2–4',
    coinage: { gp: [0, 0], sp: [0, 2], cp: [0, 0] },
    items: [
      { itemName: 'Animal Hide', weight: 55, qty: [1, 2] },
      { itemName: 'Trophy Antler', weight: 30, qty: [1, 1] },
      { itemName: 'Sharp Fang', weight: 35, qty: [1, 3] },
    ],
  },

  // ── Celestial: radiant relics, honest coin ───────────────────────────────
  {
    type: 'celestial',
    crBucket: '2–4',
    coinage: { gp: [3, 12], sp: [0, 10], cp: [0, 0] },
    items: [{ itemName: 'Radiant Feather', weight: 50, qty: [1, 2] }],
  },
  {
    type: 'celestial',
    crBucket: '5–10',
    coinage: { gp: [10, 40], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Radiant Feather', weight: 45, qty: [1, 3] },
      { itemName: 'Blessed Icon', weight: 35, qty: [1, 1] },
    ],
  },
  {
    type: 'celestial',
    crBucket: '11+',
    coinage: { gp: [40, 150], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Blessed Icon', weight: 50, qty: [1, 1] },
      { itemName: 'Vial of Celestial Light', weight: 30, qty: [1, 1] },
    ],
  },

  // ── Construct: fragments and cores, whatever was built into them ─────────
  {
    type: 'construct',
    crBucket: '0–1',
    coinage: { gp: [0, 1], sp: [0, 4], cp: [0, 10] },
    items: [{ itemName: 'Construct Fragment', weight: 60, qty: [1, 2] }],
  },
  {
    type: 'construct',
    crBucket: '2–4',
    coinage: { gp: [0, 4], sp: [2, 10], cp: [0, 0] },
    items: [
      { itemName: 'Construct Fragment', weight: 55, qty: [1, 3] },
      { itemName: 'Etched Power Core', weight: 25, qty: [1, 1] },
    ],
  },
  {
    type: 'construct',
    crBucket: '5–10',
    coinage: { gp: [2, 15], sp: [5, 20], cp: [0, 0] },
    items: [
      { itemName: 'Etched Power Core', weight: 45, qty: [1, 1] },
      { itemName: 'Construct Fragment', weight: 40, qty: [1, 4] },
    ],
  },

  // ── Dragon: the hoard scales hard with CR ────────────────────────────────
  {
    type: 'dragon',
    crBucket: '0–1',
    coinage: { gp: [2, 10], sp: [5, 20], cp: [10, 40] },
    items: [{ itemName: 'Loose Hoard Coins', weight: 40, qty: [1, 1] }],
  },
  {
    type: 'dragon',
    crBucket: '2–4',
    coinage: { gp: [10, 40], sp: [20, 60], cp: [0, 0] },
    items: [
      { itemName: 'Gilded Goblet', weight: 40, qty: [1, 1] },
      { itemName: 'Polished Gemstone', weight: 35, qty: [1, 2] },
    ],
  },
  {
    type: 'dragon',
    crBucket: '5–10',
    coinage: { gp: [40, 150], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Polished Gemstone', weight: 50, qty: [1, 3] },
      { itemName: 'Gilded Goblet', weight: 35, qty: [1, 2] },
      { itemName: 'Jeweled Circlet', weight: 20, qty: [1, 1] },
    ],
  },
  {
    type: 'dragon',
    crBucket: '11+',
    coinage: { gp: [150, 600], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Polished Gemstone', weight: 55, qty: [2, 5] },
      { itemName: 'Jeweled Circlet', weight: 30, qty: [1, 1] },
      { itemName: 'Ancient Coin Cache', weight: 35, qty: [1, 2] },
    ],
  },

  // ── Elemental: residue of the plane they came from, no pockets ───────────
  {
    type: 'elemental',
    crBucket: '0–1',
    coinage: NO_COIN,
    items: [{ itemName: 'Elemental Residue', weight: 50, qty: [1, 1] }],
  },
  {
    type: 'elemental',
    crBucket: '2–4',
    coinage: NO_COIN,
    items: [{ itemName: 'Elemental Residue', weight: 55, qty: [1, 2] }],
  },
  {
    type: 'elemental',
    crBucket: '5–10',
    coinage: NO_COIN,
    items: [
      { itemName: 'Elemental Core Shard', weight: 45, qty: [1, 1] },
      { itemName: 'Elemental Residue', weight: 40, qty: [1, 3] },
    ],
  },

  // ── Fey: charms and bargaining trinkets, the odd coin ────────────────────
  {
    type: 'fey',
    crBucket: '0',
    coinage: { gp: [0, 0], sp: [0, 2], cp: [0, 6] },
    items: [{ itemName: 'Woven Charm', weight: 45, qty: [1, 1] }],
  },
  {
    type: 'fey',
    crBucket: '0–1',
    coinage: { gp: [0, 2], sp: [0, 6], cp: [0, 10] },
    items: [
      { itemName: 'Woven Charm', weight: 45, qty: [1, 2] },
      { itemName: 'Moonlit Acorn', weight: 30, qty: [1, 1] },
    ],
  },
  {
    type: 'fey',
    crBucket: '2–4',
    coinage: { gp: [1, 6], sp: [2, 10], cp: [0, 0] },
    items: [
      { itemName: 'Woven Charm', weight: 40, qty: [1, 2] },
      { itemName: 'Faerie Bargain Token', weight: 25, qty: [1, 1] },
    ],
  },

  // ── Fiend: infernal contracts and plundered coin ─────────────────────────
  {
    type: 'fiend',
    crBucket: '0–1',
    coinage: { gp: [0, 3], sp: [2, 8], cp: [0, 10] },
    items: [{ itemName: 'Brimstone Shard', weight: 50, qty: [1, 1] }],
  },
  {
    type: 'fiend',
    crBucket: '2–4',
    coinage: { gp: [3, 15], sp: [5, 15], cp: [0, 0] },
    items: [
      { itemName: 'Brimstone Shard', weight: 45, qty: [1, 2] },
      { itemName: 'Sealed Infernal Contract', weight: 20, qty: [1, 1] },
    ],
  },
  {
    type: 'fiend',
    crBucket: '5–10',
    coinage: { gp: [15, 60], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Sealed Infernal Contract', weight: 35, qty: [1, 1] },
      { itemName: 'Obsidian Talisman', weight: 35, qty: [1, 1] },
    ],
  },
  {
    type: 'fiend',
    crBucket: '11+',
    coinage: { gp: [60, 250], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Sealed Infernal Contract', weight: 40, qty: [1, 2] },
      { itemName: 'Obsidian Talisman', weight: 40, qty: [1, 2] },
    ],
  },

  // ── Giant: sacks of crude wealth ─────────────────────────────────────────
  {
    type: 'giant',
    crBucket: '2–4',
    coinage: { gp: [5, 20], sp: [10, 40], cp: [20, 60] },
    items: [{ itemName: 'Oversized Sack of Goods', weight: 50, qty: [1, 1] }],
  },
  {
    type: 'giant',
    crBucket: '5–10',
    coinage: { gp: [20, 80], sp: [20, 80], cp: [0, 0] },
    items: [
      { itemName: 'Oversized Sack of Goods', weight: 50, qty: [1, 2] },
      { itemName: 'Crude Gemstone', weight: 35, qty: [1, 3] },
    ],
  },
  {
    type: 'giant',
    crBucket: '11+',
    coinage: { gp: [80, 300], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Crude Gemstone', weight: 50, qty: [2, 4] },
      { itemName: 'Oversized Sack of Goods', weight: 40, qty: [1, 2] },
    ],
  },

  // ── Humanoid: gear off the body — borrows the NPC arsenal ────────────────
  {
    type: 'humanoid',
    crBucket: '0',
    coinage: { gp: [0, 0], sp: [0, 3], cp: [2, 10] },
    items: [
      { itemName: 'Dagger', weight: 50, qty: [1, 1] },
      { itemName: 'Sling', weight: 30, qty: [1, 1] },
    ],
  },
  {
    type: 'humanoid',
    crBucket: '0–1',
    coinage: { gp: [0, 3], sp: [2, 10], cp: [4, 16] },
    items: [
      { itemName: 'Scimitar', weight: 40, qty: [1, 1] },
      { itemName: 'Dagger', weight: 45, qty: [1, 2] },
      { itemName: 'Light Crossbow', weight: 25, qty: [1, 1] },
    ],
  },
  {
    type: 'humanoid',
    crBucket: '2–4',
    coinage: { gp: [2, 10], sp: [5, 20], cp: [0, 0] },
    items: [
      { itemName: 'Shortsword', weight: 45, qty: [1, 1] },
      { itemName: 'Spear', weight: 35, qty: [1, 1] },
      { itemName: 'Dagger', weight: 30, qty: [1, 2] },
    ],
  },
  {
    type: 'humanoid',
    crBucket: '5–10',
    coinage: { gp: [8, 35], sp: [10, 30], cp: [0, 0] },
    items: [
      { itemName: 'Longsword', weight: 45, qty: [1, 1] },
      { itemName: 'Shortsword', weight: 35, qty: [1, 1] },
      { itemName: 'Signet Ring', weight: 20, qty: [1, 1] },
    ],
  },

  // ── Monstrosity: trophies and whatever its victims carried ───────────────
  {
    type: 'monstrosity',
    crBucket: '0–1',
    coinage: { gp: [0, 1], sp: [0, 5], cp: [0, 12] },
    items: [{ itemName: 'Monster Trophy Claw', weight: 50, qty: [1, 1] }],
  },
  {
    type: 'monstrosity',
    crBucket: '2–4',
    coinage: { gp: [1, 8], sp: [2, 12], cp: [0, 0] },
    items: [
      { itemName: 'Monster Trophy Claw', weight: 50, qty: [1, 2] },
      { itemName: 'Victim’s Coin Purse', weight: 30, qty: [1, 1] },
    ],
  },
  {
    type: 'monstrosity',
    crBucket: '5–10',
    coinage: { gp: [5, 25], sp: [5, 25], cp: [0, 0] },
    items: [
      { itemName: 'Monster Trophy Claw', weight: 45, qty: [1, 3] },
      { itemName: 'Victim’s Coin Purse', weight: 35, qty: [1, 2] },
    ],
  },

  // ── Ooze: corroded remnants of the digested ──────────────────────────────
  {
    type: 'ooze',
    crBucket: '0–1',
    coinage: { gp: [0, 0], sp: [0, 3], cp: [0, 15] },
    items: [{ itemName: 'Corroded Belt Buckle', weight: 35, qty: [1, 1] }],
  },
  {
    type: 'ooze',
    crBucket: '2–4',
    coinage: { gp: [0, 2], sp: [1, 8], cp: [5, 25] },
    items: [
      { itemName: 'Corroded Belt Buckle', weight: 35, qty: [1, 2] },
      { itemName: 'Half-Dissolved Boot', weight: 25, qty: [1, 1] },
    ],
  },

  // ── Plant: seeds, spores, the rare herb — no coin ────────────────────────
  {
    type: 'plant',
    crBucket: '0',
    coinage: NO_COIN,
    items: [{ itemName: 'Odd Seed Pod', weight: 40, qty: [1, 2] }],
  },
  {
    type: 'plant',
    crBucket: '0–1',
    coinage: NO_COIN,
    items: [
      { itemName: 'Odd Seed Pod', weight: 40, qty: [1, 3] },
      { itemName: 'Rare Herb Bundle', weight: 25, qty: [1, 1] },
    ],
  },
  {
    type: 'plant',
    crBucket: '2–4',
    coinage: NO_COIN,
    items: [
      { itemName: 'Rare Herb Bundle', weight: 40, qty: [1, 2] },
      { itemName: 'Luminous Spore Sac', weight: 30, qty: [1, 1] },
    ],
  },

  // ── Undead: grave goods and tarnished coin ───────────────────────────────
  {
    type: 'undead',
    crBucket: '0',
    coinage: { gp: [0, 0], sp: [0, 2], cp: [0, 10] },
    items: [{ itemName: 'Tarnished Locket', weight: 30, qty: [1, 1] }],
  },
  {
    type: 'undead',
    crBucket: '0–1',
    coinage: { gp: [0, 2], sp: [1, 8], cp: [5, 20] },
    items: [
      { itemName: 'Tarnished Locket', weight: 35, qty: [1, 1] },
      { itemName: 'Burial Shroud Scrap', weight: 30, qty: [1, 1] },
    ],
  },
  {
    type: 'undead',
    crBucket: '2–4',
    coinage: { gp: [1, 8], sp: [3, 15], cp: [0, 0] },
    items: [
      { itemName: 'Tarnished Locket', weight: 35, qty: [1, 2] },
      { itemName: 'Grave Offering Bowl', weight: 30, qty: [1, 1] },
    ],
  },
  {
    type: 'undead',
    crBucket: '5–10',
    coinage: { gp: [5, 30], sp: [5, 30], cp: [0, 0] },
    items: [
      { itemName: 'Grave Offering Bowl', weight: 40, qty: [1, 1] },
      { itemName: 'Funerary Mask', weight: 25, qty: [1, 1] },
    ],
  },
  {
    type: 'undead',
    crBucket: '11+',
    coinage: { gp: [30, 120], sp: [0, 0], cp: [0, 0] },
    items: [
      { itemName: 'Funerary Mask', weight: 40, qty: [1, 1] },
      { itemName: 'Ancient Coin Cache', weight: 35, qty: [1, 1] },
    ],
  },
];
