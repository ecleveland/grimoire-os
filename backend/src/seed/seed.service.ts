import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums';
import { fetchAllDetails } from './srd-api.fetcher';
import {
  transformSpell,
  transformMonster,
  transformEquipment,
  transformMagicItem,
  transformBackground,
  transformFeat,
  type ApiSpell,
  type ApiMonster,
  type ApiEquipment,
  type ApiMagicItem,
  type ApiBackground,
  type ApiFeat,
} from './srd-api.transformers';
import { srdSpells as fallbackSpells } from './data/spells';
import { srdMonsters as fallbackMonsters } from './data/monsters';
import { srdItems as fallbackItems } from './data/items';
import { srdClasses } from './data/classes';
import { srdRaces } from './data/races';
import { srdSubclasses } from './data/subclasses';
import { srdSubraces } from './data/subraces';
import { srdConditions } from './data/conditions';
import { srdSkills } from './data/skills';
import { srdLanguages } from './data/languages';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) {}

  async seed(): Promise<void> {
    const useApi = process.env.SEED_FROM_API !== 'false';

    // ── Phase A: Fetch from API ────────────────────────
    // Cast to Prisma input types since transformer return types use plain `null`
    // for JSON fields, while Prisma expects `NullableJsonNullValueInput`
    let spells = fallbackSpells as unknown as Prisma.SpellCreateManyInput[];
    let monsters = fallbackMonsters as unknown as Prisma.MonsterCreateManyInput[];
    let items = fallbackItems as unknown as Prisma.ItemCreateManyInput[];
    let backgrounds: Prisma.BackgroundCreateManyInput[] = [];
    let feats: Prisma.FeatCreateManyInput[] = [];

    if (useApi) {
      try {
        console.log('Fetching SRD data from D&D 5e API...');

        // Fetch sequentially to avoid overwhelming the API with rate limits
        const apiSpells = await fetchAllDetails<ApiSpell>('spells');
        spells = apiSpells.map(transformSpell) as unknown as Prisma.SpellCreateManyInput[];

        const apiMonsters = await fetchAllDetails<ApiMonster>('monsters');
        monsters = apiMonsters.map(transformMonster) as unknown as Prisma.MonsterCreateManyInput[];

        const apiEquipment = await fetchAllDetails<ApiEquipment>('equipment');
        const equipmentItems = apiEquipment.map(
          transformEquipment
        ) as unknown as Prisma.ItemCreateManyInput[];

        const apiMagicItems = await fetchAllDetails<ApiMagicItem>('magic-items');
        const magicItems = apiMagicItems.map(
          transformMagicItem
        ) as unknown as Prisma.ItemCreateManyInput[];
        items = [...equipmentItems, ...magicItems];

        const apiBackgrounds = await fetchAllDetails<ApiBackground>('backgrounds');
        backgrounds = apiBackgrounds.map(
          transformBackground
        ) as unknown as Prisma.BackgroundCreateManyInput[];

        const apiFeats = await fetchAllDetails<ApiFeat>('feats');
        feats = apiFeats.map(transformFeat) as unknown as Prisma.FeatCreateManyInput[];

        console.log('API fetch complete.');
      } catch (error: unknown) {
        console.warn('API fetch failed, falling back to static data:', (error as Error).message);
      }
    } else {
      console.log('SEED_FROM_API=false, using static fallback data.');
    }

    // ── Phase B: Write to database ─────────────────────
    console.log('Seeding SRD data...');

    await this.prisma.$transaction(async tx => {
      // Independent tables (no FK dependencies)
      await tx.spell.createMany({ data: spells, skipDuplicates: true });
      console.log(`  Spells: ${spells.length} entries`);

      await tx.monster.createMany({ data: monsters, skipDuplicates: true });
      console.log(`  Monsters: ${monsters.length} entries`);

      await tx.item.createMany({ data: items, skipDuplicates: true });
      console.log(`  Items: ${items.length} entries`);

      if (backgrounds.length) {
        await tx.background.createMany({
          data: backgrounds,
          skipDuplicates: true,
        });
        console.log(`  Backgrounds: ${backgrounds.length} entries`);
      }

      if (feats.length) {
        await tx.feat.createMany({ data: feats, skipDuplicates: true });
        console.log(`  Feats: ${feats.length} entries`);
      }

      await tx.condition.createMany({
        data: srdConditions,
        skipDuplicates: true,
      });
      console.log(`  Conditions: ${srdConditions.length} entries`);

      await tx.skill.createMany({ data: srdSkills, skipDuplicates: true });
      console.log(`  Skills: ${srdSkills.length} entries`);

      await tx.language.createMany({
        data: srdLanguages,
        skipDuplicates: true,
      });
      console.log(`  Languages: ${srdLanguages.length} entries`);

      // Parent tables for FK relations
      await tx.srdClass.createMany({ data: srdClasses, skipDuplicates: true });
      console.log(`  Classes: ${srdClasses.length} entries`);

      await tx.race.createMany({ data: srdRaces, skipDuplicates: true });
      console.log(`  Races: ${srdRaces.length} entries`);

      // FK-dependent tables
      for (const sc of srdSubclasses) {
        const parent = await tx.srdClass.findUnique({
          where: { name: sc.className },
        });
        if (!parent) {
          console.warn(`  WARNING: Class "${sc.className}" not found for subclass "${sc.name}"`);
          continue;
        }
        await tx.subclass.upsert({
          where: { name: sc.name },
          create: {
            name: sc.name,
            classId: parent.id,
            description: sc.description,
            features: sc.features,
            spellList: sc.spellList,
          },
          update: {
            classId: parent.id,
            description: sc.description,
            features: sc.features,
            spellList: sc.spellList,
          },
        });
      }
      console.log(`  Subclasses: ${srdSubclasses.length} entries`);

      for (const sr of srdSubraces) {
        const parent = await tx.race.findUnique({
          where: { name: sr.raceName },
        });
        if (!parent) {
          console.warn(`  WARNING: Race "${sr.raceName}" not found for subrace "${sr.name}"`);
          continue;
        }
        await tx.subrace.upsert({
          where: { name: sr.name },
          create: {
            name: sr.name,
            raceId: parent.id,
            description: sr.description,
            abilityBonuses: sr.abilityBonuses,
            traits: sr.traits,
          },
          update: {
            raceId: parent.id,
            description: sr.description,
            abilityBonuses: sr.abilityBonuses,
            traits: sr.traits,
          },
        });
      }
      console.log(`  Subraces: ${srdSubraces.length} entries`);
    });

    console.log('SRD seed complete.');

    // ── Dev-only admin user ────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
      await this.seedDevAdmin();
    }
  }

  private async seedDevAdmin(): Promise<void> {
    const username = 'admin';
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      console.log('Dev admin user already exists, skipping.');
      return;
    }

    const passwordHash = await bcrypt.hash('admin', 10);
    await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: 'Admin (Dev)',
        role: Role.ADMIN,
      },
    });
    console.log('Dev admin user created (username: "admin", password: "admin").');
  }
}
