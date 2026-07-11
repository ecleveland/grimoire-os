import { Inject, Injectable, Logger } from '@nestjs/common';
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
  loadEquipmentFromJson,
  loadSpeciesAsRacesFromJson,
} from './srd-json.loader';
import { assertUniqueSeedNames } from './seed-guards';
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

// Source discriminator for the NPC-generator reference tables. Rows the seed
// owns are tagged 'curated'; anything else (user-added) is left untouched on
// reseed. Hoisted so the literal isn't duplicated across every replaceCurated.
const CURATED = 'curated';

// Explicit timeout for the one big interactive seed transaction. The SRD passes
// do hundreds of per-row findFirst→create/update round-trips, which can exceed
// Prisma's 5s interactive-transaction default on slower hosts.
const SEED_TX_TIMEOUT_MS = 120_000;

// Dev-only admin credentials (non-production). Hoisted out of the method body so
// the magic values live in one obvious place.
const DEV_ADMIN_USERNAME = 'admin';
const DEV_ADMIN_PASSWORD = 'admin';
const BCRYPT_COST = 12;

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

// Minimal view of a delegate whose rows are resolved by name to their ids —
// used to wire up FK relations for child feature/trait tables.
interface NameLookupDelegate {
  findMany(args: {
    where: { name: { in: string[] }; contentSource?: string };
    select: { id: true; name: true };
  }): Promise<{ id: string; name: string }[]>;
}

// Minimal view of a delegate seeded via the clear-curated-then-recreate pattern.
interface CuratedDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  createMany(args: { data: unknown[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
}

// Prisma's generated delegate types don't structurally assign to the narrow,
// hand-written shapes above (overload-heavy signatures), so a cast is
// unavoidable. Centralize each one behind a named helper rather than scattering
// `as unknown as` across the call sites.
const srdDelegate = (delegate: unknown): SrdSeedDelegate => delegate as SrdSeedDelegate;
const nameLookupDelegate = (delegate: unknown): NameLookupDelegate =>
  delegate as NameLookupDelegate;
const curatedDelegate = (delegate: unknown): CuratedDelegate => delegate as CuratedDelegate;

// Split a background's origin-feat display string into the base feat name and
// its parameterized option: "Magic Initiate (Cleric)" → { featName: "Magic
// Initiate", option: "Cleric" }; "Alert" → { featName: "Alert", option: null }.
function parseOriginFeat(display: string): { featName: string; option: string | null } {
  const match = display.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return match
    ? { featName: match[1].trim(), option: match[2].trim() }
    : { featName: display.trim(), option: null };
}

// All SRD data, loaded and transformed into Prisma input shapes, ready to write.
interface SeedData {
  spells: Prisma.SpellCreateManyInput[];
  monsters: Prisma.MonsterCreateManyInput[];
  items: Prisma.ItemCreateManyInput[];
  equipment: ReturnType<typeof loadEquipmentFromJson>;
  races: ReturnType<typeof loadSpeciesAsRacesFromJson>;
  backgrounds: Prisma.BackgroundCreateManyInput[];
  feats: Prisma.FeatCreateManyInput[];
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  async seed(): Promise<void> {
    this.logger.log('Loading SRD data from extracted JSON files...');
    const data = this.loadSeedData();

    this.logger.log('Seeding SRD data...');
    await this.prisma.$transaction(
      async tx => {
        // SRD content (spells/monsters/items/feats) is seeded by name within the
        // contentSource='srd' partition so corrected SRD data — e.g. the VEG-261
        // field-bleed fixes and the VEG-271 spell description/table fixes —
        // propagates to existing rows on re-seed (preserving ids/FKs) while
        // leaving any user homebrew rows in the same tables untouched (VEG-292).
        await this.seedSpells(tx, data);
        await this.seedMonsters(tx, data);
        await this.seedItems(tx, data);
        await this.seedEquipmentBundles(tx, data);
        // Feats before backgrounds: seedBackgrounds resolves each background's
        // origin feat (VEG-429) and writes the FK in the same upsert.
        await this.seedFeats(tx, data);
        await this.seedBackgrounds(tx, data);
        await this.seedSimpleReferenceTables(tx);
        await this.seedClasses(tx);
        await this.seedRaces(tx, data);
        await this.seedClassFeatures(tx);
        await this.seedRaceTraits(tx, data);
        await this.seedBackgroundFeatures(tx);
        await this.seedSubclasses(tx);
        await this.seedNpcReferenceData(tx);
        await this.seedSubraces(tx);
      },
      { timeout: SEED_TX_TIMEOUT_MS }
    );

    this.logger.log('SRD seed complete.');

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

  // Load every SRD dataset and transform it into the Prisma input shapes the
  // write passes consume. This is the single boundary where the loader outputs
  // are cast to the generated Prisma `*CreateManyInput` types.
  private loadSeedData(): SeedData {
    const spells = loadSpellsFromJson() as unknown as Prisma.SpellCreateManyInput[];
    const monsters = loadMonstersFromJson() as unknown as Prisma.MonsterCreateManyInput[];
    const magicItems = loadMagicItemsFromJson() as unknown as Prisma.ItemCreateManyInput[];
    const equipment = loadEquipmentFromJson();
    const races = loadSpeciesAsRacesFromJson();

    // Both item sources feed the same table and are upserted by name — fail
    // loudly on any collision before touching the database (VEG-308).
    assertUniqueSeedNames('item', {
      'equipment.json': equipment.items.map(i => i.name),
      'magic_items.json': magicItems.map(i => i.name),
    });
    const items = [...(equipment.items as unknown as Prisma.ItemCreateManyInput[]), ...magicItems];

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

    return { spells, monsters, items, equipment, races, backgrounds, feats };
  }

  // ── Shared write helpers ─────────────────────────────

  // Idempotently (re-)seed SRD reference rows keyed on (name, contentSource='srd').
  //
  // Uses findFirst→update/create rather than upsert-by-name because `name` is no
  // longer globally unique (homebrew rows may reuse SRD names — VEG-292); the
  // remaining name uniqueness is the partial index scoped to contentSource='srd'.
  // Scoping every read and write to contentSource='srd' guarantees a re-seed can
  // never read, update, or delete a user's homebrew row. Corrected SRD data still
  // propagates to existing rows on re-seed, preserving ids/FKs.
  private async seedSrdByName(
    delegate: SrdSeedDelegate,
    rows: { name: string }[],
    kind: string
  ): Promise<void> {
    // Upserting by name makes duplicate names a silent last-write-wins clobber;
    // every dataset fed to this mechanism is dedup-checked here so a future
    // second source can't skip the guard (the cross-source item check in
    // loadSeedData() additionally attributes collisions to their files).
    assertUniqueSeedNames(kind, { [kind]: rows.map(r => r.name) });
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

  // Resolve a set of rows by name to a name→id map, used to wire FK relations for
  // child feature/trait tables.
  private async resolveIdsByName(
    delegate: NameLookupDelegate,
    names: string[],
    contentSource?: string
  ): Promise<Map<string, string>> {
    const rows = await delegate.findMany({
      where: { name: { in: names }, ...(contentSource ? { contentSource } : {}) },
      select: { id: true, name: true },
    });
    return new Map(rows.map(r => [r.name, r.id]));
  }

  // Seed a curated reference table idempotently: clear the rows the seed owns
  // (matched by `where`) and re-create them. User-added rows that fall outside
  // `where` survive the reseed. `skipDuplicates` is opt-in because some of these
  // tables have no unique constraint, where it would be inert and misleading.
  private async replaceCurated(
    delegate: CuratedDelegate,
    where: Record<string, unknown>,
    rows: unknown[],
    options: { skipDuplicates?: boolean } = {}
  ): Promise<void> {
    await delegate.deleteMany({ where });
    await delegate.createMany(
      options.skipDuplicates ? { data: rows, skipDuplicates: true } : { data: rows }
    );
  }

  // ── SRD content (contentSource-partitioned) ──────────

  private async seedSpells(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    await this.seedSrdByName(srdDelegate(tx.spell), data.spells, 'spell');
    this.logger.log(`  Spells: ${data.spells.length} entries`);
  }

  private async seedMonsters(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    await this.seedSrdByName(srdDelegate(tx.monster), data.monsters, 'monster');
    this.logger.log(`  Monsters: ${data.monsters.length} entries`);
  }

  private async seedItems(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    // Item names are unique across the equipment and magic-item JSON sources
    // (assertUniqueSeedNames in loadSeedData); the contentSource='srd' partial
    // unique index enforces it at the database level.
    await this.seedSrdByName(srdDelegate(tx.item), data.items, 'item');
    this.logger.log(`  Items: ${data.items.length} entries`);

    // Retire srd rows that no longer exist in any source — e.g. the old
    // 5-item hand-authored stub's "Rope, Hempen (50 feet)" and the mundane
    // "Potion of Healing" copy (canonical entry: the "Potions of Healing"
    // magic item). Scoped to contentSource='srd', so homebrew/shared rows
    // are untouchable; ItemBundleEntry rows cascade. This is the seed's only
    // destructive step, so the count is always logged.
    const itemNames = data.items.map(i => i.name);
    const retired = await tx.item.deleteMany({
      where: { contentSource: 'srd', name: { notIn: itemNames } },
    });
    this.logger.log(`  Items retired: ${retired.count}`);
  }

  // Equipment packs, second pass: with all item rows in place, resolve the pack
  // and component ids by name and rewrite each pack's bundle entries (delete +
  // recreate keeps re-seeding idempotent).
  private async seedEquipmentBundles(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    const { bundles } = data.equipment;
    const bundleNames = [
      ...new Set(bundles.flatMap(b => [b.bundleName, ...b.components.map(c => c.name)])),
    ];
    const bundleRows = await tx.item.findMany({
      where: { contentSource: 'srd', name: { in: bundleNames } },
      select: { id: true, name: true },
    });
    const idByName = new Map(bundleRows.map(r => [r.name, r.id]));
    const resolveId = (name: string): string => {
      const id = idByName.get(name);
      if (!id) throw new Error(`Seed aborted: bundle item "${name}" did not resolve to a row`);
      return id;
    };
    for (const bundle of bundles) {
      const bundleId = resolveId(bundle.bundleName);
      await tx.itemBundleEntry.deleteMany({ where: { bundleId } });
      await tx.itemBundleEntry.createMany({
        data: bundle.components.map(c => ({
          bundleId,
          componentId: resolveId(c.name),
          quantity: c.quantity,
        })),
      });
    }
    this.logger.log(`  Equipment packs: ${bundles.length} bundles`);
  }

  private async seedBackgrounds(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    if (!data.backgrounds.length) return;
    // Resolve each background's canonical origin feat (VEG-429) and merge the
    // FK into the row before the shared write pass, so reseed both links new
    // mappings and clears stale ones (a background that loses its `feat`
    // writes originFeatId back to null). The write itself rides seedSrdByName:
    // duplicate-name guard + srd-partition-scoped findFirst→update/create, so
    // a re-seed can never touch a homebrew background reusing an SRD name.
    const originFeatByBackground = await this.resolveBackgroundOriginFeats(tx);
    const rows = data.backgrounds.map(background => ({
      ...background,
      ...(originFeatByBackground.get(background.name) ?? {
        originFeatId: null,
        originFeatOption: null,
      }),
    }));
    await this.seedSrdByName(srdDelegate(tx.background), rows, 'background');
    this.logger.log(`  Backgrounds: ${data.backgrounds.length} entries`);
  }

  // Resolve every background's origin-feat display string (e.g. "Magic Initiate
  // (Cleric)") to the canonical SRD `Feat` row (VEG-429): parse off the
  // parenthetical option, match the base name against contentSource='srd' feats,
  // and key the {id, option} by background name. Requires feats to be seeded
  // first. Throws on any unresolved feat so missing/renamed data fails loudly
  // rather than silently dropping the link.
  private async resolveBackgroundOriginFeats(
    tx: Prisma.TransactionClient
  ): Promise<Map<string, { originFeatId: string; originFeatOption: string | null }>> {
    const parsed = srdBackgrounds
      .filter(b => b.feat)
      .map(b => ({ background: b.name, ...parseOriginFeat(b.feat) }));

    const featNames = [...new Set(parsed.map(p => p.featName))];
    const featIdByName = await this.resolveIdsByName(nameLookupDelegate(tx.feat), featNames, 'srd');

    const result = new Map<string, { originFeatId: string; originFeatOption: string | null }>();
    for (const p of parsed) {
      const originFeatId = featIdByName.get(p.featName);
      if (!originFeatId) {
        throw new Error(
          `Seed aborted: background "${p.background}" origin feat "${p.featName}" did not resolve to an SRD feat row`
        );
      }
      result.set(p.background, { originFeatId, originFeatOption: p.option });
    }
    return result;
  }

  private async seedFeats(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    if (!data.feats.length) return;
    await this.seedSrdByName(srdDelegate(tx.feat), data.feats, 'feat');
    this.logger.log(`  Feats: ${data.feats.length} entries`);
  }

  // ── Simple reference tables (createMany / skipDuplicates) ──

  private async seedSimpleReferenceTables(tx: Prisma.TransactionClient): Promise<void> {
    await tx.condition.createMany({ data: srdConditions, skipDuplicates: true });
    this.logger.log(`  Conditions: ${srdConditions.length} entries`);

    await tx.skill.createMany({ data: srdSkills, skipDuplicates: true });
    this.logger.log(`  Skills: ${srdSkills.length} entries`);

    await tx.language.createMany({ data: srdLanguages, skipDuplicates: true });
    this.logger.log(`  Languages: ${srdLanguages.length} entries`);

    await tx.gameRule.createMany({ data: srdGameRules, skipDuplicates: true });
    this.logger.log(`  Game Rules: ${srdGameRules.length} entries`);
  }

  // ── Classes / races (parents) and their child tables ──

  private async seedClasses(tx: Prisma.TransactionClient): Promise<void> {
    // Strip embedded feature arrays before insert; those live in their own
    // table, seeded by seedClassFeatures().
    const classRows = srdClasses.map(({ features: _features, ...rest }) => rest);
    await tx.srdClass.createMany({ data: classRows, skipDuplicates: true });
    this.logger.log(`  Classes: ${classRows.length} entries`);
  }

  private async seedRaces(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    // Strip embedded trait arrays before insert; those live in their own table,
    // seeded by seedRaceTraits().
    const raceRows = data.races.map(({ traits: _traits, ...rest }) => rest);
    await tx.race.createMany({ data: raceRows, skipDuplicates: true });
    this.logger.log(`  Races: ${raceRows.length} entries`);
  }

  private async seedClassFeatures(tx: Prisma.TransactionClient): Promise<void> {
    const classIdByName = await this.resolveIdsByName(
      nameLookupDelegate(tx.srdClass),
      srdClasses.map(c => c.name)
    );
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
      await tx.classFeature.createMany({ data: classFeatureRows, skipDuplicates: true });
    }
    this.logger.log(`  Class Features: ${classFeatureRows.length} entries`);
  }

  private async seedRaceTraits(tx: Prisma.TransactionClient, data: SeedData): Promise<void> {
    const raceIdByName = await this.resolveIdsByName(
      nameLookupDelegate(tx.race),
      data.races.map(r => r.name)
    );
    // Upsert (not createMany/skipDuplicates), keyed on the [raceId, name] unique, so
    // corrected SRD trait text — e.g. the VEG-273 lineage/ancestry option tables embedded
    // in the description — propagates to existing rows on re-seed, preserving ids/FKs.
    let raceTraitCount = 0;
    for (const race of data.races) {
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
    this.logger.log(`  Race Traits: ${raceTraitCount} entries`);
  }

  private async seedBackgroundFeatures(tx: Prisma.TransactionClient): Promise<void> {
    // Pinned to the srd partition so a homebrew background reusing an SRD name
    // can never receive the seed's child feature rows (VEG-431).
    const backgroundIdByName = await this.resolveIdsByName(
      nameLookupDelegate(tx.background),
      srdBackgrounds.map(b => b.name),
      'srd'
    );
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
    this.logger.log(`  Background Features: ${backgroundFeatureRows.length} entries`);
  }

  private async seedSubclasses(tx: Prisma.TransactionClient): Promise<void> {
    let subclassFeatureCount = 0;
    for (const sc of srdSubclasses) {
      const parent = await tx.srdClass.findUnique({ where: { name: sc.className } });
      if (!parent) {
        this.logger.warn(`  WARNING: Class "${sc.className}" not found for subclass "${sc.name}"`);
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
        await tx.subclassFeature.createMany({ data: features, skipDuplicates: true });
        subclassFeatureCount += features.length;
      }
    }
    this.logger.log(`  Subclasses: ${srdSubclasses.length} entries`);
    this.logger.log(`  Subclass Features: ${subclassFeatureCount} entries`);
  }

  // ── NPC Generator reference data ─────────────────────
  // Curated tables: clear curated rows and re-create. User-added rows
  // (source !== 'curated') survive reseed.
  private async seedNpcReferenceData(tx: Prisma.TransactionClient): Promise<void> {
    await this.replaceCurated(
      curatedDelegate(tx.npcNamePool),
      { source: CURATED },
      npcNamePools.map(n => ({ race: n.race, gender: n.gender, kind: n.kind, value: n.value })),
      { skipDuplicates: true }
    );
    this.logger.log(`  NPC Name Pools: ${npcNamePools.length} entries`);

    await this.replaceCurated(
      curatedDelegate(tx.npcAppearanceTrait),
      { source: CURATED },
      npcAppearanceTraits.map(t => ({ race: t.race, category: t.category, trait: t.trait })),
      { skipDuplicates: true }
    );
    this.logger.log(`  NPC Appearance Traits: ${npcAppearanceTraits.length} entries`);

    // Each loot-template family clears and re-creates only its own curated rows,
    // so neither block silently load-bears for the other. The table has no
    // unique constraint, so skipDuplicates would be inert here — idempotency
    // comes from these scoped deletes.
    await this.replaceCurated(
      curatedDelegate(tx.npcLootTemplate),
      { source: CURATED, category: 'npc' },
      npcLootTemplates.map(t => ({
        category: 'npc' as const,
        profession: t.profession,
        crBucket: t.crBucket,
        coinage: t.coinage as unknown as Prisma.InputJsonValue,
        items: t.items as unknown as Prisma.InputJsonValue,
      }))
    );
    this.logger.log(`  NPC Loot Templates: ${npcLootTemplates.length} entries`);

    await this.replaceCurated(
      curatedDelegate(tx.npcLootTemplate),
      { source: CURATED, category: 'monster' },
      monsterLootTemplates.map(t => ({
        category: 'monster' as const,
        profession: t.type,
        crBucket: t.crBucket,
        coinage: t.coinage as unknown as Prisma.InputJsonValue,
        items: t.items as unknown as Prisma.InputJsonValue,
      }))
    );
    this.logger.log(`  Monster Loot Templates: ${monsterLootTemplates.length} entries`);

    // Alignment priors carry nullable `background` (default rows), and Prisma
    // compound uniques don't accept null. Drop curated rows and re-create
    // instead of upserting.
    await this.replaceCurated(
      curatedDelegate(tx.npcAlignmentPrior),
      { source: CURATED },
      npcAlignmentPriors.map(p => ({ race: p.race, background: p.background, weights: p.weights })),
      { skipDuplicates: true }
    );
    this.logger.log(`  NPC Alignment Priors: ${npcAlignmentPriors.length} entries`);

    await this.replaceCurated(
      curatedDelegate(tx.trinket),
      { source: { in: [CURATED, 'srd-5.0'] } },
      trinkets.map(t => ({ description: t.description, source: t.source })),
      { skipDuplicates: true }
    );
    this.logger.log(`  Trinkets: ${trinkets.length} entries`);
  }

  private async seedSubraces(tx: Prisma.TransactionClient): Promise<void> {
    for (const sr of srdSubraces) {
      const parent = await tx.race.findUnique({ where: { name: sr.raceName } });
      if (!parent) {
        this.logger.warn(`  WARNING: Race "${sr.raceName}" not found for subrace "${sr.name}"`);
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
    this.logger.log(`  Subraces: ${srdSubraces.length} entries`);
  }

  private async seedDevAdmin(): Promise<void> {
    const username = DEV_ADMIN_USERNAME;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      this.logger.log('Dev admin user already exists, skipping.');
      return;
    }

    const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, BCRYPT_COST);
    await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: 'Admin (Dev)',
        role: Role.ADMIN,
      },
    });
    this.logger.log(
      `Dev admin user created (username: "${DEV_ADMIN_USERNAME}", password: "${DEV_ADMIN_PASSWORD}").`
    );
  }
}
