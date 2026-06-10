import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
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
import { npcNamePools } from './data/npc-name-pools';
import { npcAppearanceTraits } from './data/npc-appearance-traits';
import { npcLootTemplates } from './data/npc-loot-templates';
import { monsterLootTemplates } from './data/monster-loot-templates';
import { npcAlignmentPriors } from './data/npc-alignment-priors';
import { trinkets } from './data/trinkets';

// Minimal structural view of a Prisma delegate for SRD reference tables that
// carry a `contentSource` discriminator (spells/monsters/items/feats). The seed
// only needs these three operations; the real delegates are cast to this shape.
interface SrdSeedDelegate {
  findFirst(args: {
    where: { name: string; contentSource: 'srd' };
    select: { id: true };
  }): Promise<{ id: string } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

@Injectable()
export class SeedService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  // Idempotently (re-)seed SRD reference rows keyed on (name, contentSource='srd').
  //
  // Uses findFirst→update/create rather than upsert-by-name because `name` is no
  // longer globally unique (homebrew rows may reuse SRD names — VEG-292); the
  // remaining name uniqueness is the partial index scoped to contentSource='srd'.
  // Scoping every read and write to contentSource='srd' guarantees a re-seed can
  // never read, update, or delete a user's homebrew row. Corrected SRD data still
  // propagates to existing rows on re-seed, preserving ids/FKs.
  private async seedSrdByName(delegate: SrdSeedDelegate, rows: { name: string }[]): Promise<void> {
    for (const row of rows) {
      const data = { ...row, contentSource: 'srd' as const };
      const existing = await delegate.findFirst({
        where: { name: row.name, contentSource: 'srd' },
        select: { id: true },
      });
      if (existing) {
        await delegate.update({ where: { id: existing.id }, data });
      } else {
        await delegate.create({ data });
      }
    }
  }

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
      category: f.category ?? null,
      repeatable: f.repeatable ?? false,
    }));

    // ── Write to database ──────────────────────────────
    console.log('Seeding SRD data...');

    await this.prisma.$transaction(async tx => {
      // SRD content (spells/monsters/items/feats) is seeded by name within the
      // contentSource='srd' partition so corrected SRD data — e.g. the VEG-261
      // field-bleed fixes and the VEG-271 spell description/table fixes —
      // propagates to existing rows on re-seed (preserving ids/FKs) while leaving
      // any user homebrew rows in the same tables untouched (VEG-292).
      await this.seedSrdByName(tx.spell as unknown as SrdSeedDelegate, spells);
      console.log(`  Spells: ${spells.length} entries`);

      await this.seedSrdByName(tx.monster as unknown as SrdSeedDelegate, monsters);
      console.log(`  Monsters: ${monsters.length} entries`);

      // Item names are unique across the mundane (hand-authored) and magic (JSON)
      // SRD rows that share this table; the contentSource='srd' partial unique
      // index enforces it.
      await this.seedSrdByName(tx.item as unknown as SrdSeedDelegate, items);
      console.log(`  Items: ${items.length} entries`);

      if (backgrounds.length) {
        for (const background of backgrounds) {
          await tx.background.upsert({
            where: { name: background.name },
            create: background,
            update: background,
          });
        }
        console.log(`  Backgrounds: ${backgrounds.length} entries`);
      }

      if (feats.length) {
        await this.seedSrdByName(tx.feat as unknown as SrdSeedDelegate, feats);
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
      // Upsert (not createMany/skipDuplicates), keyed on the [raceId, name] unique, so
      // corrected SRD trait text — e.g. the VEG-273 lineage/ancestry option tables embedded
      // in the description — propagates to existing rows on re-seed, preserving ids/FKs.
      let raceTraitCount = 0;
      for (const race of races) {
        const raceId = raceIdByName.get(race.name);
        if (!raceId) continue;
        for (const t of race.traits ?? []) {
          await tx.raceTrait.upsert({
            where: { raceId_name: { raceId, name: t.name } },
            create: { raceId, name: t.name, description: t.description },
            update: { description: t.description },
          });
          raceTraitCount++;
        }
      }
      console.log(`  Race Traits: ${raceTraitCount} entries`);

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

      // ── NPC Generator reference data ─────────────────
      // Curated tables: clear curated rows and re-create. User-added rows
      // (source !== 'curated') survive reseed.
      await tx.npcNamePool.deleteMany({ where: { source: 'curated' } });
      await tx.npcNamePool.createMany({
        data: npcNamePools.map(n => ({
          race: n.race,
          gender: n.gender,
          kind: n.kind,
          value: n.value,
        })),
        skipDuplicates: true,
      });
      console.log(`  NPC Name Pools: ${npcNamePools.length} entries`);

      await tx.npcAppearanceTrait.deleteMany({ where: { source: 'curated' } });
      await tx.npcAppearanceTrait.createMany({
        data: npcAppearanceTraits.map(t => ({
          race: t.race,
          category: t.category,
          trait: t.trait,
        })),
        skipDuplicates: true,
      });
      console.log(`  NPC Appearance Traits: ${npcAppearanceTraits.length} entries`);

      await tx.npcLootTemplate.deleteMany({ where: { source: 'curated' } });
      await tx.npcLootTemplate.createMany({
        data: npcLootTemplates.map(t => ({
          profession: t.profession,
          crBucket: t.crBucket,
          coinage: t.coinage as unknown as Prisma.InputJsonValue,
          items: t.items as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      console.log(`  NPC Loot Templates: ${npcLootTemplates.length} entries`);

      // Monster loot templates share the table; the curated deleteMany above
      // already cleared both categories.
      await tx.npcLootTemplate.createMany({
        data: monsterLootTemplates.map(t => ({
          category: 'monster',
          profession: t.type,
          crBucket: t.crBucket,
          coinage: t.coinage as unknown as Prisma.InputJsonValue,
          items: t.items as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      console.log(`  Monster Loot Templates: ${monsterLootTemplates.length} entries`);

      // Alignment priors carry nullable `background` (default rows), and
      // Prisma compound uniques don't accept null. Drop curated rows and
      // re-create instead of upserting.
      await tx.npcAlignmentPrior.deleteMany({ where: { source: 'curated' } });
      await tx.npcAlignmentPrior.createMany({
        data: npcAlignmentPriors.map(p => ({
          race: p.race,
          background: p.background,
          weights: p.weights,
        })),
        skipDuplicates: true,
      });
      console.log(`  NPC Alignment Priors: ${npcAlignmentPriors.length} entries`);

      await tx.trinket.deleteMany({
        where: { source: { in: ['curated', 'srd-5.0'] } },
      });
      await tx.trinket.createMany({
        data: trinkets.map(t => ({
          description: t.description,
          source: t.source,
        })),
        skipDuplicates: true,
      });
      console.log(`  Trinkets: ${trinkets.length} entries`);

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

    // Drop any cached SRD reads. With the default in-memory store the seed
    // runs in its own Nest context (see run-seed.ts), so this only clears the
    // seed process's local cache — the running backend's cache is independent
    // and falls back to the CacheModule's 24h TTL. Swap in a shared Keyv
    // adapter (Redis, etc.) in app.module.ts to make this cross-process.
    await this.cache.clear();
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

    const passwordHash = await bcrypt.hash('admin', 12);
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
