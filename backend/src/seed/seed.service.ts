import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums';
import {
  loadSpellsFromJson,
  loadMonstersFromJson,
  loadMagicItemsFromJson,
  loadSpeciesAsRacesFromJson,
} from './srd-json.loader';
import { srdItems as mundaneItems } from './data/items';
import { srdClasses } from './data/classes';
import { srdSubclasses } from './data/subclasses';
import { srdSubraces } from './data/subraces';
import { srdConditions } from './data/conditions';
import { srdSkills } from './data/skills';
import { srdLanguages } from './data/languages';
import { srdBackgrounds } from './data/backgrounds';
import { srdFeats } from './data/feats';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) {}

  async seed(): Promise<void> {
    // ── Load data from JSON files ──────────────────────
    console.log('Loading SRD data from extracted JSON files...');

    const spells = loadSpellsFromJson() as unknown as Prisma.SpellCreateManyInput[];
    const monsters = loadMonstersFromJson() as unknown as Prisma.MonsterCreateManyInput[];
    const magicItems = loadMagicItemsFromJson() as unknown as Prisma.ItemCreateManyInput[];
    const races = loadSpeciesAsRacesFromJson();

    const items = [...(mundaneItems as unknown as Prisma.ItemCreateManyInput[]), ...magicItems];

    const backgrounds: Prisma.BackgroundCreateManyInput[] = srdBackgrounds.map(b => ({
      name: b.name,
      description: b.description,
      skillProficiencies: b.skillProficiencies,
      toolProficiencies: b.toolProficiencies,
      languages: b.languages,
      equipment: b.equipment,
      feature: b.feature ?? Prisma.JsonNull,
      personalityTraits: b.personalityTraits,
      ideals: b.ideals,
      bonds: b.bonds,
      flaws: b.flaws,
    }));
    const feats: Prisma.FeatCreateManyInput[] = srdFeats.map(f => ({
      name: f.name,
      description: f.description,
      prerequisite: f.prerequisite ?? null,
      benefits: f.benefits,
    }));

    // ── Write to database ──────────────────────────────
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

      await tx.race.createMany({ data: races, skipDuplicates: true });
      console.log(`  Races: ${races.length} entries`);

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
            spellcasting: sc.spellcasting,
          },
          update: {
            classId: parent.id,
            description: sc.description,
            features: sc.features,
            spellList: sc.spellList,
            spellcasting: sc.spellcasting,
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
