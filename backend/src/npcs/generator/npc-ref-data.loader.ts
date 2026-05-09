// Loads the NpcRefData snapshot the generator pipeline operates on.
// One pass per generate/reroll call — the dataset is small (a few thousand
// rows total across reference tables), so caching is not required for v1.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NpcRefData } from './npc-pipeline';
import { npcSettingBiases } from '../../seed/data/npc-setting-biases';

const NPC_GAME_RULE_CATEGORY = 'npc-generation';

const DEFAULT_GAME_RULES = {
  trinketChance: 0.05,
  magicItemChanceByCr: {
    '0': 0.001,
    '0–1': 0.005,
    '2–4': 0.02,
    '5–10': 0.05,
    '11+': 0.15,
  } as Record<string, number>,
  itemCountDie: '1d3',
  coinageMultiplier: 1,
};

@Injectable()
export class NpcRefDataLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(): Promise<NpcRefData> {
    const [
      species,
      backgrounds,
      alignmentPriors,
      namePools,
      appearanceTraits,
      lootTemplates,
      trinkets,
      items,
      gameRules,
    ] = await Promise.all([
      this.prisma.race.findMany({ select: { name: true, size: true } }),
      this.prisma.background.findMany({
        select: {
          name: true,
          personalityTraits: true,
          ideals: true,
          bonds: true,
          flaws: true,
        },
      }),
      this.prisma.npcAlignmentPrior.findMany({ where: { isActive: true } }),
      this.prisma.npcNamePool.findMany({ where: { isActive: true } }),
      this.prisma.npcAppearanceTrait.findMany({ where: { isActive: true } }),
      this.prisma.npcLootTemplate.findMany({ where: { isActive: true } }),
      this.prisma.trinket.findMany({ where: { isActive: true }, select: { description: true } }),
      this.prisma.item.findMany({ select: { id: true, name: true, isMagic: true } }),
      this.prisma.gameRule.findMany({ where: { category: NPC_GAME_RULE_CATEGORY } }),
    ]);

    const itemsByName = new Map<string, { id: string; name: string; isMagic: boolean }>();
    const magicItems: { id: string; name: string; isMagic: boolean }[] = [];
    for (const it of items) {
      itemsByName.set(it.name, it);
      if (it.isMagic) magicItems.push(it);
    }

    const gameRulesMap = new Map<string, unknown>();
    for (const r of gameRules) gameRulesMap.set(r.key, r.value);

    return {
      species: species.map(s => ({ name: s.name, size: s.size })),
      backgrounds,
      alignmentPriors: alignmentPriors.map(p => ({
        race: p.race,
        background: p.background,
        weights: p.weights,
      })),
      namePools: namePools.map(n => ({
        race: n.race,
        gender: n.gender,
        kind: n.kind as 'first' | 'family' | 'epithet',
        value: n.value,
      })),
      appearanceTraits: appearanceTraits.map(t => ({
        race: t.race,
        category: t.category as never,
        trait: t.trait,
      })),
      lootTemplates: lootTemplates.map(t => ({
        profession: t.profession,
        crBucket: t.crBucket,
        coinage: t.coinage as never,
        items: t.items as never,
      })),
      trinkets,
      itemsByName,
      magicItems,
      settingBiases: npcSettingBiases,
      gameRules: {
        trinketChance:
          (gameRulesMap.get('trinket-chance') as number | undefined) ??
          DEFAULT_GAME_RULES.trinketChance,
        magicItemChanceByCr:
          (gameRulesMap.get('magic-item-chance-by-cr') as Record<string, number> | undefined) ??
          DEFAULT_GAME_RULES.magicItemChanceByCr,
        itemCountDie:
          (gameRulesMap.get('item-count-die') as string | undefined) ??
          DEFAULT_GAME_RULES.itemCountDie,
        coinageMultiplier:
          (gameRulesMap.get('coinage-multiplier') as number | undefined) ??
          DEFAULT_GAME_RULES.coinageMultiplier,
      },
    };
  }
}
