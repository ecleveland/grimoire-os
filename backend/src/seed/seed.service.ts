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
import { srdGameRules } from './data/game-rules';

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

      await tx.gameRule.createMany({
        data: srdGameRules,
        skipDuplicates: true,
      });
      console.log(`  Game Rules: ${srdGameRules.length} entries`);

      // Parent tables for FK relations — strip embedded feature/trait arrays
      // before insert; those now live in their own tables (created below).
      const classRows = srdClasses.map(({ features: _features, ...rest }) => rest);
      await tx.srdClass.createMany({ data: classRows, skipDuplicates: true });
      console.log(`  Classes: ${classRows.length} entries`);

      const raceRows = races.map(({ traits: _traits, ...rest }) => rest);
      await tx.race.createMany({ data: raceRows, skipDuplicates: true });
      console.log(`  Races: ${raceRows.length} entries`);

      // ── Class features ───────────────────────────────
      const classNames = srdClasses.map(c => c.name);
      const classRecords = await tx.srdClass.findMany({
        where: { name: { in: classNames } },
        select: { id: true, name: true },
      });
      const classIdByName = new Map(classRecords.map(c => [c.name, c.id]));
      const classFeatureRows: Prisma.ClassFeatureCreateManyInput[] = [];
      for (const cls of srdClasses) {
        const classId = classIdByName.get(cls.name);
        if (!classId) continue;
        for (const f of cls.features ?? []) {
          classFeatureRows.push({
            classId,
            name: f.name,
            level: f.level,
            description: f.description,
          });
        }
      }
      if (classFeatureRows.length) {
        await tx.classFeature.createMany({
          data: classFeatureRows,
          skipDuplicates: true,
        });
      }
      console.log(`  Class Features: ${classFeatureRows.length} entries`);

      // ── Race traits ──────────────────────────────────
      const raceNames = races.map(r => r.name);
      const raceRecords = await tx.race.findMany({
        where: { name: { in: raceNames } },
        select: { id: true, name: true },
      });
      const raceIdByName = new Map(raceRecords.map(r => [r.name, r.id]));
      const raceTraitRows: Prisma.RaceTraitCreateManyInput[] = [];
      for (const race of races) {
        const raceId = raceIdByName.get(race.name);
        if (!raceId) continue;
        for (const t of race.traits ?? []) {
          raceTraitRows.push({
            raceId,
            name: t.name,
            description: t.description,
          });
        }
      }
      if (raceTraitRows.length) {
        await tx.raceTrait.createMany({
          data: raceTraitRows,
          skipDuplicates: true,
        });
      }
      console.log(`  Race Traits: ${raceTraitRows.length} entries`);

      // ── Background features ──────────────────────────
      const backgroundNames = srdBackgrounds.map(b => b.name);
      const backgroundRecords = await tx.background.findMany({
        where: { name: { in: backgroundNames } },
        select: { id: true, name: true },
      });
      const backgroundIdByName = new Map(backgroundRecords.map(b => [b.name, b.id]));
      const backgroundFeatureRows: Prisma.BackgroundFeatureCreateManyInput[] = [];
      for (const bg of srdBackgrounds) {
        const feature = bg.feature as { name: string; description: string } | null;
        if (!feature) continue;
        const backgroundId = backgroundIdByName.get(bg.name);
        if (!backgroundId) continue;
        backgroundFeatureRows.push({
          backgroundId,
          name: feature.name,
          description: feature.description,
        });
      }
      if (backgroundFeatureRows.length) {
        await tx.backgroundFeature.createMany({
          data: backgroundFeatureRows,
          skipDuplicates: true,
        });
      }
      console.log(`  Background Features: ${backgroundFeatureRows.length} entries`);

      // ── Subclasses + their features ──────────────────
      let subclassFeatureCount = 0;
      for (const sc of srdSubclasses) {
        const parent = await tx.srdClass.findUnique({
          where: { name: sc.className },
        });
        if (!parent) {
          console.warn(`  WARNING: Class "${sc.className}" not found for subclass "${sc.name}"`);
          continue;
        }
        const subclass = await tx.subclass.upsert({
          where: { name: sc.name },
          create: {
            name: sc.name,
            classId: parent.id,
            description: sc.description,
            spellList: sc.spellList,
            spellcasting: sc.spellcasting,
          },
          update: {
            classId: parent.id,
            description: sc.description,
            spellList: sc.spellList,
            spellcasting: sc.spellcasting,
          },
        });
        const features: Prisma.SubclassFeatureCreateManyInput[] = (sc.features ?? []).map(f => ({
          subclassId: subclass.id,
          name: f.name,
          level: f.level,
          description: f.description,
        }));
        if (features.length) {
          await tx.subclassFeature.createMany({
            data: features,
            skipDuplicates: true,
          });
          subclassFeatureCount += features.length;
        }
      }
      console.log(`  Subclasses: ${srdSubclasses.length} entries`);
      console.log(`  Subclass Features: ${subclassFeatureCount} entries`);

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
