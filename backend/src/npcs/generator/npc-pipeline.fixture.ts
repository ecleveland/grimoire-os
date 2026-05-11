// Builds an in-memory NpcRefData fixture from the actual seed-data modules.
// Used by NpcPipeline tests so every step exercises real curated content.

import { NpcRefData, MonsterRef } from './npc-pipeline';
import { srdSpecies } from '../../seed/data/species';
import { srdBackgrounds } from '../../seed/data/backgrounds';
import { npcAlignmentPriors } from '../../seed/data/npc-alignment-priors';
import { npcNamePools } from '../../seed/data/npc-name-pools';
import { npcAppearanceTraits } from '../../seed/data/npc-appearance-traits';
import { npcLootTemplates } from '../../seed/data/npc-loot-templates';
import { trinkets as trinketSeed } from '../../seed/data/trinkets';
import { npcSettingBiases } from '../../seed/data/npc-setting-biases';

export function buildSeedRefData(overrides: Partial<NpcRefData> = {}): NpcRefData {
  const itemsByName = new Map<string, { id: string; name: string; isMagic: boolean }>();
  // Test fixture stubs items with predictable ids so we can assert on them.
  for (const tpl of npcLootTemplates) {
    for (const it of tpl.items) {
      if (!itemsByName.has(it.itemName)) {
        itemsByName.set(it.itemName, {
          id: `item-${itemsByName.size}`,
          name: it.itemName,
          isMagic: false,
        });
      }
    }
  }
  const magicItems = [
    { id: 'magic-1', name: 'Cloak of Protection', isMagic: true },
    { id: 'magic-2', name: 'Wand of Magic Missiles', isMagic: true },
  ];

  return {
    monsters: TEST_MONSTERS.slice(),
    species: srdSpecies.map(s => ({ name: s.name, size: s.size })),
    backgrounds: srdBackgrounds.map(b => ({
      name: b.name,
      personalityTraits: b.personalityTraits,
      ideals: b.ideals,
      bonds: b.bonds,
      flaws: b.flaws,
    })),
    alignmentPriors: npcAlignmentPriors.map(p => ({
      race: p.race,
      background: p.background,
      weights: p.weights,
    })),
    namePools: npcNamePools.map(n => ({
      race: n.race,
      gender: n.gender,
      kind: n.kind,
      value: n.value,
    })),
    appearanceTraits: npcAppearanceTraits.map(t => ({
      race: t.race,
      category: t.category,
      trait: t.trait,
    })),
    lootTemplates: npcLootTemplates.map(t => ({
      profession: t.profession,
      crBucket: t.crBucket,
      coinage: t.coinage,
      items: t.items,
    })),
    trinkets: trinketSeed.map(t => ({ description: t.description })),
    itemsByName,
    magicItems,
    settingBiases: npcSettingBiases,
    gameRules: {
      trinketChance: 0.05,
      magicItemChanceByCr: {
        '0': 0.001,
        '0–1': 0.005,
        '2–4': 0.02,
        '5–10': 0.05,
        '11+': 0.15,
      },
      itemCountDie: '1d3',
      coinageMultiplier: 1,
    },
    ...overrides,
  };
}

// Minimal but representative subset of SRD monsters covering the curated
// combatant pools used by pickStatBlock. Real data is loaded via Prisma in
// production; this keeps the pipeline tests hermetic.
const TEST_MONSTERS: MonsterRef[] = [
  monster({
    name: 'Commoner',
    size: 'Medium',
    alignment: 'Any Alignment',
    armorClass: 10,
    hitPoints: 4,
    challengeRating: 0,
    str: 10,
    actions: [
      {
        name: 'Club',
        description: 'Melee Weapon Attack: (club). Hit: 2 (1d4) bludgeoning damage.',
      },
    ],
  }),
  monster({
    name: 'Bandit',
    size: 'Medium',
    alignment: 'Any Non-Lawful',
    armorClass: 12,
    armorType: 'Leather Armor',
    hitPoints: 11,
    challengeRating: 0.125,
    experiencePoints: 25,
    str: 11,
    dex: 12,
    actions: [
      {
        name: 'Scimitar',
        description:
          'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) slashing damage.',
      },
      {
        name: 'Light Crossbow',
        description: 'Ranged Weapon Attack: +3 to hit. Hit: 5 (1d8 + 1) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Guard',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 16,
    armorType: 'Chain Shirt, Shield',
    hitPoints: 11,
    challengeRating: 0.125,
    str: 13,
    actions: [
      {
        name: 'Spear',
        description: 'Melee or Ranged Weapon Attack: +3 to hit. Hit: 4 (1d6 + 1) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Priest Acolyte',
    size: 'Medium',
    alignment: 'Any Alignment',
    armorClass: 10,
    hitPoints: 9,
    challengeRating: 0.25,
    str: 10,
    wis: 14,
    actions: [
      {
        name: 'Club',
        description: 'Melee Weapon Attack: (club). Hit: 2 (1d4) bludgeoning damage.',
      },
    ],
    specialAbilities: [
      { name: 'Spellcasting', description: 'The acolyte is a 1st-level spellcaster.' },
    ],
  }),
  monster({
    name: 'Scout',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 13,
    armorType: 'Leather Armor',
    hitPoints: 16,
    challengeRating: 0.5,
    str: 11,
    dex: 14,
    actions: [
      {
        name: 'Shortsword',
        description: 'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) piercing damage.',
      },
      {
        name: 'Longbow',
        description: 'Ranged Weapon Attack: +4 to hit. Hit: 6 (1d8 + 2) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Spy',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 12,
    hitPoints: 27,
    challengeRating: 1,
    str: 10,
    dex: 15,
    actions: [
      {
        name: 'Shortsword',
        description: 'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Knight',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 18,
    armorType: 'Plate Armor',
    hitPoints: 52,
    challengeRating: 3,
    str: 16,
    actions: [
      {
        name: 'Greatsword',
        description: 'Melee Weapon Attack: +5 to hit. Hit: 10 (2d6 + 3) slashing damage.',
      },
      {
        name: 'Heavy Crossbow',
        description: 'Ranged Weapon Attack: +2 to hit. Hit: 5 (1d10) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Warrior Veteran',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 17,
    armorType: 'Splint Armor',
    hitPoints: 58,
    challengeRating: 3,
    str: 16,
    actions: [
      {
        name: 'Longsword',
        description: 'Melee Weapon Attack: +5 to hit. Hit: 7 (1d8 + 3) slashing damage.',
      },
      {
        name: 'Shortsword',
        description: 'Melee Weapon Attack: +5 to hit. Hit: 6 (1d6 + 3) piercing damage.',
      },
    ],
  }),
  monster({
    name: 'Mage',
    size: 'Medium',
    alignment: 'Any',
    armorClass: 12,
    hitPoints: 40,
    challengeRating: 6,
    str: 9,
    int: 17,
    actions: [
      {
        name: 'Quarterstaff',
        description: 'Melee Weapon Attack: +1 to hit. Hit: 3 (1d6) bludgeoning damage.',
      },
    ],
    specialAbilities: [
      { name: 'Spellcasting', description: 'The mage is a 9th-level spellcaster.' },
    ],
  }),
];

function monster(o: Partial<MonsterRef> & { name: string }): MonsterRef {
  return {
    size: o.size ?? 'Medium',
    type: o.type ?? 'humanoid',
    subtype: o.subtype ?? null,
    alignment: o.alignment ?? null,
    armorClass: o.armorClass ?? 10,
    armorType: o.armorType ?? null,
    hitPoints: o.hitPoints ?? 1,
    hitDice: o.hitDice ?? null,
    speed: o.speed ?? '30 ft.',
    str: o.str ?? 10,
    dex: o.dex ?? 10,
    con: o.con ?? 10,
    int: o.int ?? 10,
    wis: o.wis ?? 10,
    cha: o.cha ?? 10,
    savingThrows: o.savingThrows ?? null,
    skills: o.skills ?? null,
    damageResistances: o.damageResistances ?? [],
    damageImmunities: o.damageImmunities ?? [],
    damageVulnerabilities: o.damageVulnerabilities ?? [],
    conditionImmunities: o.conditionImmunities ?? [],
    senses: o.senses ?? null,
    languages: o.languages ?? null,
    challengeRating: o.challengeRating ?? 0,
    experiencePoints: o.experiencePoints ?? null,
    specialAbilities: o.specialAbilities ?? null,
    actions: o.actions ?? [{ name: 'Fist', description: 'Hit: 1 bludgeoning damage.' }],
    reactions: o.reactions ?? null,
    legendaryActions: o.legendaryActions ?? null,
    name: o.name,
  };
}
