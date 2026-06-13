// Loads the NpcRefData snapshot the generator pipeline operates on.
// One pass per generate/reroll call — the dataset is small (a few thousand
// rows total across reference tables), so caching is not required for v1.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NpcRefData, MonsterRef } from './npc-pipeline';
import { StatBlockAction } from './npc-generator.types';
import { npcSettingBiases } from '../../seed/data/npc-setting-biases';
import { LOOT_GAME_RULE_CATEGORY, resolveLootGameRules } from '../../loot/loot-game-rules';
import { buildItemCatalogMaps } from '../../loot/item-catalog';
import { GLOBAL_CONTENT_SOURCES } from '../../srd/content-access.service';

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
      customPersonality,
      items,
      monsters,
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
      this.prisma.npcLootTemplate.findMany({ where: { isActive: true, category: 'npc' } }),
      this.prisma.trinket.findMany({ where: { isActive: true }, select: { description: true } }),
      this.prisma.npcCustomPersonality.findMany({
        where: { isActive: true },
        select: { background: true, kind: true, value: true },
      }),
      // Pinned to the global catalog (VEG-296): NPC loot resolves template
      // item names and draws magic items from this pool, so an owner-scoped
      // homebrew row here would leak one user's private content into every
      // user's generated NPCs.
      this.prisma.item.findMany({
        where: { contentSource: { in: [...GLOBAL_CONTENT_SOURCES] } },
        select: { id: true, name: true, isMagic: true },
      }),
      this.prisma.monster.findMany(),
      this.prisma.gameRule.findMany({ where: { category: LOOT_GAME_RULE_CATEGORY } }),
    ]);

    const { itemsByName, magicItems } = buildItemCatalogMaps(items);

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
      customPersonality: customPersonality.map(c => ({
        background: c.background,
        kind: c.kind as 'personalityTraits' | 'ideals' | 'bonds' | 'flaws',
        value: c.value,
      })),
      itemsByName,
      magicItems,
      monsters: monsters.map(toMonsterRef),
      settingBiases: npcSettingBiases,
      gameRules: resolveLootGameRules(gameRules),
    };
  }
}

type PrismaMonster = {
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
  savingThrows: unknown;
  skills: unknown;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string | null;
  languages: string | null;
  challengeRating: number;
  experiencePoints: number | null;
  specialAbilities: unknown;
  actions: unknown;
  reactions: unknown;
  legendaryActions: unknown;
};

function toMonsterRef(m: PrismaMonster): MonsterRef {
  return {
    name: m.name,
    size: m.size,
    type: m.type,
    subtype: m.subtype,
    alignment: m.alignment,
    armorClass: m.armorClass,
    armorType: m.armorType,
    hitPoints: m.hitPoints,
    hitDice: m.hitDice,
    speed: m.speed,
    str: m.str,
    dex: m.dex,
    con: m.con,
    int: m.int,
    wis: m.wis,
    cha: m.cha,
    savingThrows: (m.savingThrows as Record<string, number> | null) ?? null,
    skills: (m.skills as Record<string, number> | null) ?? null,
    damageResistances: m.damageResistances,
    damageImmunities: m.damageImmunities,
    damageVulnerabilities: m.damageVulnerabilities,
    conditionImmunities: m.conditionImmunities,
    senses: m.senses,
    languages: m.languages,
    challengeRating: m.challengeRating,
    experiencePoints: m.experiencePoints,
    specialAbilities: (m.specialAbilities as StatBlockAction[] | null) ?? null,
    actions: (m.actions as StatBlockAction[] | null) ?? [],
    reactions: (m.reactions as StatBlockAction[] | null) ?? null,
    legendaryActions: (m.legendaryActions as StatBlockAction[] | null) ?? null,
  };
}
