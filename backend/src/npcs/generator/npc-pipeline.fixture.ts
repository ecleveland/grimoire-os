// Builds an in-memory NpcRefData fixture from the actual seed-data modules.
// Used by NpcPipeline tests so every step exercises real curated content.

import { NpcRefData } from './npc-pipeline';
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
