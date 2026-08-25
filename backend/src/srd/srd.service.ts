import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Spell, Monster, Item, Feat, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { QuerySpellsDto } from './dto/query-spells.dto';
import { QueryMonstersDto } from './dto/query-monsters.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { QueryFeatsDto } from './dto/query-feats.dto';
import { QueryFeaturesDto, FeatureParentType } from './dto/query-features.dto';
import { QuerySearchDto, SearchKind } from './dto/query-search.dto';
import { ContentAccessService, GLOBAL_CONTENT_SOURCES } from './content-access.service';

// Raw-SQL counterpart of ContentAccessService.globalWhere(), for the pg_trgm and
// unified-search queries that build SQL by hand. Pins a content table to the
// global catalog (SRD + admin-published shared), keeping owner-scoped homebrew
// out of the public `/srd/*` responses (VEG-311). The `::text` cast lets the
// enum column compare against the bound string parameters.
const GLOBAL_SOURCE_SQL = Prisma.sql`"contentSource"::text IN (${Prisma.join([
  ...GLOBAL_CONTENT_SOURCES,
])})`;

// Owner-aware raw-SQL counterpart of ContentAccessService.visibleTo() (VEG-293):
// the global catalog plus, for authenticated callers, their own homebrew rows.
function visibleSourceSql(userId?: string): Prisma.Sql {
  if (!userId) return GLOBAL_SOURCE_SQL;
  return Prisma.sql`(${GLOBAL_SOURCE_SQL} OR "createdById" = ${userId})`;
}

// Minimum query length that triggers pg_trgm similarity matching. Below this we
// fall back to plain ILIKE substring matching — single-char fuzzy queries return
// too much noise (every word has at least one character of overlap).
const FUZZY_MIN_QUERY_LENGTH = 2;

// Per-entity similarity thresholds. Tune independently if one resource grows
// noisier than another (spells skew long, items skew short, etc.).
const SPELL_FUZZY_THRESHOLD = 0.2;
const MONSTER_FUZZY_THRESHOLD = 0.2;
const ITEM_FUZZY_THRESHOLD = 0.2;

export type UnifiedFeatureData = {
  id: string;
  name: string;
  level?: number;
  description: string;
  parent: { kind: FeatureParentType; id: string; name: string };
};

export type UnifiedSearchHit =
  | { kind: 'spell'; data: Spell }
  | { kind: 'feat'; data: Feat }
  | { kind: 'item'; data: Item }
  | { kind: 'feature'; data: UnifiedFeatureData };

const CLASS_FEATURE_ORDER = [{ level: 'asc' as const }, { name: 'asc' as const }];
const SUBCLASS_FEATURE_ORDER = [{ level: 'asc' as const }, { name: 'asc' as const }];
const NAME_ORDER = { name: 'asc' as const };

type FeatureSearchHit = {
  kind: FeatureParentType;
  id: string;
  name: string;
  description: string;
  level?: number;
  parent: { id: string; name: string };
};

type UnifiedSourceTag =
  | 'spell'
  | 'feat'
  | 'item'
  | 'feature:class'
  | 'feature:subclass'
  | 'feature:race'
  | 'feature:background';

type UnifiedSource = {
  tag: UnifiedSourceTag;
  table: Prisma.Sql;
  whereSql: Prisma.Sql;
};

type UnifiedIdRow = { source: UnifiedSourceTag; id: string };

const FEATURE_TABLE: Record<FeatureParentType, Prisma.Sql> = {
  class: Prisma.sql`"class_features"`,
  subclass: Prisma.sql`"subclass_features"`,
  race: Prisma.sql`"race_traits"`,
  background: Prisma.sql`"background_features"`,
};

const FEATURE_PARENT_COLUMN: Record<FeatureParentType, Prisma.Sql> = {
  class: Prisma.sql`"classId"`,
  subclass: Prisma.sql`"subclassId"`,
  race: Prisma.sql`"raceId"`,
  background: Prisma.sql`"backgroundId"`,
};

const FEATURE_TAG: Record<FeatureParentType, UnifiedSourceTag> = {
  class: 'feature:class',
  subclass: 'feature:subclass',
  race: 'feature:race',
  background: 'feature:background',
};

const ALL_FEATURE_PARENTS: FeatureParentType[] = ['class', 'subclass', 'race', 'background'];

function joinWhere(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

function shouldUseFuzzy(q?: string): q is string {
  return typeof q === 'string' && q.length >= FUZZY_MIN_QUERY_LENGTH;
}

// Builds a fuzzy text-match condition that combines case-insensitive substring
// matching (so exact matches always qualify) with pg_trgm similarity (so typos
// and partial fragments still match). The matching CASE expression mirrors the
// branches so substring hits score 1.0 / 0.9 and similarity hits fall below.
function buildFuzzyMatchSql(query: string, threshold: number): Prisma.Sql {
  const like = `%${query}%`;
  return Prisma.sql`(
    "name" ILIKE ${like}
    OR "description" ILIKE ${like}
    OR similarity("name", ${query}) >= ${threshold}
    OR similarity(coalesce("description", ''), ${query}) >= ${threshold}
  )`;
}

function buildFuzzyScoreSql(query: string): Prisma.Sql {
  const like = `%${query}%`;
  return Prisma.sql`CASE
    WHEN LOWER("name") = LOWER(${query}) THEN 2.0
    WHEN "name" ILIKE ${like} THEN 1.0
    WHEN "description" ILIKE ${like} THEN 0.9
    ELSE GREATEST(
      similarity("name", ${query}),
      similarity(coalesce("description", ''), ${query})
    )
  END`;
}

@Injectable()
export class SrdService {
  constructor(
    private prisma: PrismaService,
    private contentAccess: ContentAccessService,
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  async invalidateCache(): Promise<void> {
    await this.cache.clear();
  }

  // ── Spells ──────────────────────────────────────────

  // Spell reads take an optional userId (VEG-294): authenticated callers see
  // the global catalog plus their own homebrew; anonymous callers see only the
  // catalog. The visibility fragment can itself be an OR, so a free-text query
  // joins it under AND instead of clobbering it.
  async searchSpells(dto: QuerySpellsDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    if (shouldUseFuzzy(dto.q)) {
      return this.fuzzySearchSpells(dto, dto.q, page, limit, userId);
    }

    const visible = this.contentAccess.visibleTo(userId);
    const where: Record<string, unknown> = dto.q
      ? {
          AND: [
            { ...visible },
            {
              OR: [
                { name: { contains: dto.q, mode: 'insensitive' } },
                { description: { contains: dto.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : { ...visible };
    if (dto.class) where.classes = { has: dto.class };
    if (dto.level !== undefined) where.level = dto.level;
    if (dto.school) where.school = dto.school;

    const [data, total] = await Promise.all([
      this.prisma.spell.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.spell.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  private async fuzzySearchSpells(
    dto: QuerySpellsDto,
    q: string,
    page: number,
    limit: number,
    userId?: string
  ) {
    const conds: Prisma.Sql[] = [
      visibleSourceSql(userId),
      buildFuzzyMatchSql(q, SPELL_FUZZY_THRESHOLD),
    ];
    if (dto.class) conds.push(Prisma.sql`${dto.class} = ANY("classes")`);
    if (dto.level !== undefined) conds.push(Prisma.sql`"level" = ${dto.level}`);
    if (dto.school) conds.push(Prisma.sql`"school" = ${dto.school}`);
    const whereSql = joinWhere(conds);
    const score = buildFuzzyScoreSql(q);
    const offset = (page - 1) * limit;

    const [data, countRows] = await Promise.all([
      this.prisma.$queryRaw<Spell[]>(
        Prisma.sql`SELECT * FROM "spells" ${whereSql} ORDER BY ${score} DESC, "name" ASC LIMIT ${limit} OFFSET ${offset}`
      ),
      this.prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total FROM "spells" ${whereSql}`
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findSpell(id: string, userId?: string) {
    return this.prisma.spell.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
    });
  }

  // ── Monsters ────────────────────────────────────────

  // Monster reads take an optional userId (VEG-293): authenticated callers see
  // the global catalog plus their own homebrew; anonymous callers see only the
  // catalog. The visibility fragment can itself be an OR, so a free-text query
  // joins it under AND instead of clobbering it.
  async searchMonsters(dto: QueryMonstersDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    if (shouldUseFuzzy(dto.q)) {
      return this.fuzzySearchMonsters(dto, dto.q, page, limit, userId);
    }

    const visible = this.contentAccess.visibleTo(userId);
    const where: Record<string, unknown> = dto.q
      ? {
          AND: [
            { ...visible },
            {
              OR: [
                { name: { contains: dto.q, mode: 'insensitive' } },
                { description: { contains: dto.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : { ...visible };
    if (dto.type) where.type = dto.type;
    if (dto.cr) where.challengeRating = parseFloat(dto.cr);
    if (dto.size) where.size = dto.size;
    if (dto.minCr || dto.maxCr) {
      where.challengeRating = {
        ...(dto.minCr ? { gte: parseFloat(dto.minCr) } : {}),
        ...(dto.maxCr ? { lte: parseFloat(dto.maxCr) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.monster.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.monster.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  private async fuzzySearchMonsters(
    dto: QueryMonstersDto,
    q: string,
    page: number,
    limit: number,
    userId?: string
  ) {
    const conds: Prisma.Sql[] = [
      visibleSourceSql(userId),
      buildFuzzyMatchSql(q, MONSTER_FUZZY_THRESHOLD),
    ];
    if (dto.type) conds.push(Prisma.sql`"type" = ${dto.type}`);
    if (dto.size) conds.push(Prisma.sql`"size" = ${dto.size}`);
    if (dto.cr) conds.push(Prisma.sql`"challengeRating" = ${parseFloat(dto.cr)}`);
    if (dto.minCr) conds.push(Prisma.sql`"challengeRating" >= ${parseFloat(dto.minCr)}`);
    if (dto.maxCr) conds.push(Prisma.sql`"challengeRating" <= ${parseFloat(dto.maxCr)}`);
    const whereSql = joinWhere(conds);
    const score = buildFuzzyScoreSql(q);
    const offset = (page - 1) * limit;

    const [data, countRows] = await Promise.all([
      this.prisma.$queryRaw<Monster[]>(
        Prisma.sql`SELECT * FROM "monsters" ${whereSql} ORDER BY ${score} DESC, "name" ASC LIMIT ${limit} OFFSET ${offset}`
      ),
      this.prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total FROM "monsters" ${whereSql}`
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findMonster(id: string, userId?: string) {
    return this.prisma.monster.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
    });
  }

  // ── Items ───────────────────────────────────────────

  // Item reads take an optional userId (VEG-296): authenticated callers see
  // the global catalog plus their own homebrew; anonymous callers see only the
  // catalog. The visibility fragment can itself be an OR, so a free-text query
  // joins it under AND instead of clobbering it.
  async searchItems(dto: QueryItemsDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    if (shouldUseFuzzy(dto.q)) {
      return this.fuzzySearchItems(dto, dto.q, page, limit, userId);
    }

    const visible = this.contentAccess.visibleTo(userId);
    const where: Record<string, unknown> = dto.q
      ? {
          AND: [
            { ...visible },
            {
              OR: [
                { name: { contains: dto.q, mode: 'insensitive' } },
                { description: { contains: dto.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : { ...visible };
    if (dto.category) where.category = dto.category;
    if (dto.rarity) where.rarity = dto.rarity;
    if (dto.isMagic !== undefined) where.isMagic = dto.isMagic === 'true';

    const [data, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  private async fuzzySearchItems(
    dto: QueryItemsDto,
    q: string,
    page: number,
    limit: number,
    userId?: string
  ) {
    const conds: Prisma.Sql[] = [
      visibleSourceSql(userId),
      buildFuzzyMatchSql(q, ITEM_FUZZY_THRESHOLD),
    ];
    if (dto.category) conds.push(Prisma.sql`"category" = ${dto.category}`);
    if (dto.rarity) conds.push(Prisma.sql`"rarity" = ${dto.rarity}`);
    if (dto.isMagic !== undefined) conds.push(Prisma.sql`"isMagic" = ${dto.isMagic === 'true'}`);
    const whereSql = joinWhere(conds);
    const score = buildFuzzyScoreSql(q);
    const offset = (page - 1) * limit;

    const [data, countRows] = await Promise.all([
      this.prisma.$queryRaw<Item[]>(
        Prisma.sql`SELECT * FROM "items" ${whereSql} ORDER BY ${score} DESC, "name" ASC LIMIT ${limit} OFFSET ${offset}`
      ),
      this.prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total FROM "items" ${whereSql}`
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // Equipment packs resolve their bundle contents to real catalog rows
  // (VEG-308); `contents` is present on the response only when non-empty.
  async findItem(id: string, userId?: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
      include: {
        bundleContents: {
          include: { component: { select: { id: true, name: true } } },
          orderBy: { component: { name: 'asc' } },
        },
      },
    });
    if (!item) return null;
    const { bundleContents, ...rest } = item;
    if (bundleContents.length === 0) return rest;
    return {
      ...rest,
      contents: bundleContents.map(e => ({
        itemId: e.component.id,
        name: e.component.name,
        quantity: e.quantity,
      })),
    };
  }

  // ── Classes ─────────────────────────────────────────

  // Tiered since VEG-505: the response now varies per caller, which is why the
  // class routes moved off SrdController's blanket URL-keyed cache and onto
  // ClassesController's AnonymousCacheInterceptor. Nothing can create a
  // homebrew class until VEG-506, so today every caller sees the same rows.
  async findAllClasses(userId?: string) {
    return this.prisma.srdClass.findMany({
      where: { ...this.contentAccess.visibleTo(userId) },
      orderBy: { name: 'asc' },
      include: { features: { orderBy: CLASS_FEATURE_ORDER } },
    });
  }

  // findFirst, not findUnique: the visibility fragment is not part of any
  // unique key, and a row the caller cannot see must read as absent (404)
  // rather than existing-but-forbidden, which would confirm it exists.
  async findClass(id: string, userId?: string) {
    return this.prisma.srdClass.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
      include: {
        // The nested include is its own read path. Scoping only the class row
        // would return every user's homebrew subclass of an SRD class to
        // everyone — the parent check `visibleSubclassWhere` adds elsewhere is
        // redundant here, since the parent is the row being fetched and is
        // already scoped by the `where` above.
        subclasses: {
          where: { ...this.contentAccess.visibleTo(userId) },
          include: { features: { orderBy: SUBCLASS_FEATURE_ORDER } },
        },
        features: { orderBy: CLASS_FEATURE_ORDER },
      },
    });
  }

  // ── Races ───────────────────────────────────────────

  async findAllRaces() {
    return this.prisma.race.findMany({
      orderBy: { name: 'asc' },
      include: { traits: { orderBy: NAME_ORDER } },
    });
  }

  async findRace(id: string) {
    return this.prisma.race.findUnique({
      where: { id },
      include: {
        subraces: true,
        traits: { orderBy: NAME_ORDER },
      },
    });
  }

  // ── Subclasses ──────────────────────────────────────

  // A subclass is only as visible as its parent class (VEG-505). Scoping the
  // subclass row alone would expose a homebrew subclass hanging off a class the
  // caller cannot see — and once VEG-509 lets a user attach a subclass to any
  // class visible to *them*, the parent check is what stops that subclass
  // leaking back to everyone who can see the parent.
  private visibleSubclassWhere(userId?: string): Prisma.SubclassWhereInput {
    const visible = this.contentAccess.visibleTo(userId);
    return { ...visible, srdClass: { is: visible } };
  }

  async searchSubclasses(classId?: string, userId?: string) {
    // Typed, not Record<string, unknown>: this fragment IS the subclass
    // visibility boundary, and a misspelled `srdClass` relation key would
    // silently delete the parent check. Note the annotation cannot catch a
    // later `where.OR = [...]` clobbering the visibility fragment — a free-text
    // filter added here must nest under `AND`, as every sibling search does.
    const where: Prisma.SubclassWhereInput = this.visibleSubclassWhere(userId);
    if (classId) where.classId = classId;
    return this.prisma.subclass.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { features: { orderBy: SUBCLASS_FEATURE_ORDER } },
    });
  }

  async findSubclass(id: string, userId?: string) {
    return this.prisma.subclass.findFirst({
      where: { id, ...this.visibleSubclassWhere(userId) },
      include: { features: { orderBy: SUBCLASS_FEATURE_ORDER } },
    });
  }

  // ── Subraces ────────────────────────────────────────

  async searchSubraces(raceId?: string) {
    const where: Record<string, unknown> = {};
    if (raceId) where.raceId = raceId;
    return this.prisma.subrace.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSubrace(id: string) {
    return this.prisma.subrace.findUnique({ where: { id } });
  }

  // ── Backgrounds ─────────────────────────────────────

  // Backgrounds are tier-scoped like feats (VEG-431): anonymous callers see the
  // global catalog, an authenticated caller's own homebrew rides along. The
  // response deliberately stays a bare (unpaginated) array — the catalog is a
  // small closed set and the builder/editor pickers are typed against it.
  async searchBackgrounds(query?: string, userId?: string) {
    const visible = this.contentAccess.visibleTo(userId);
    const where: Record<string, unknown> = query
      ? {
          AND: [
            { ...visible },
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : { ...visible };
    return this.prisma.background.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { originFeat: { select: { id: true, name: true } } },
    });
  }

  async findBackground(id: string, userId?: string) {
    // findFirst (not findUnique) so an out-of-visibility id resolves to null —
    // another user's homebrew background must not leak its existence.
    return this.prisma.background.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
      include: {
        features: { orderBy: NAME_ORDER },
        originFeat: { select: { id: true, name: true } },
      },
    });
  }

  // ── Features (cross-parent search) ──────────────────

  async searchFeatures(dto: QueryFeaturesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const types: FeatureParentType[] = dto.parentType
      ? [dto.parentType]
      : ['class', 'subclass', 'race', 'background'];

    const nameFilter = dto.q ? { name: { contains: dto.q, mode: 'insensitive' as const } } : {};

    const queries = await Promise.all(
      types.map(type => this.queryFeatureTable(type, nameFilter, dto.parentId))
    );

    const allHits: FeatureSearchHit[] = queries.flatMap(q => q.hits);
    const total = queries.reduce((sum, q) => sum + q.total, 0);

    allHits.sort((a, b) => a.name.localeCompare(b.name));
    const start = (page - 1) * limit;
    const data = allHits.slice(start, start + limit);

    return buildPaginatedResponse(data, total, page, limit);
  }

  private async queryFeatureTable(
    kind: FeatureParentType,
    nameFilter: Record<string, unknown>,
    parentId: string | undefined
  ): Promise<{ hits: FeatureSearchHit[]; total: number }> {
    if (kind === 'class') {
      const where = { ...nameFilter, ...(parentId ? { classId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.classFeature.findMany({
          where,
          include: { class: { select: { id: true, name: true } } },
        }),
        this.prisma.classFeature.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(r => ({
          kind: 'class' as const,
          id: r.id,
          name: r.name,
          description: r.description,
          level: r.level,
          parent: { id: r.class.id, name: r.class.name },
        })),
      };
    }
    if (kind === 'subclass') {
      const where = { ...nameFilter, ...(parentId ? { subclassId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.subclassFeature.findMany({
          where,
          include: { subclass: { select: { id: true, name: true } } },
        }),
        this.prisma.subclassFeature.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(r => ({
          kind: 'subclass' as const,
          id: r.id,
          name: r.name,
          description: r.description,
          level: r.level,
          parent: { id: r.subclass.id, name: r.subclass.name },
        })),
      };
    }
    if (kind === 'race') {
      const where = { ...nameFilter, ...(parentId ? { raceId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.raceTrait.findMany({
          where,
          include: { race: { select: { id: true, name: true } } },
        }),
        this.prisma.raceTrait.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(r => ({
          kind: 'race' as const,
          id: r.id,
          name: r.name,
          description: r.description,
          parent: { id: r.race.id, name: r.race.name },
        })),
      };
    }
    // background
    const where = { ...nameFilter, ...(parentId ? { backgroundId: parentId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.backgroundFeature.findMany({
        where,
        include: { background: { select: { id: true, name: true } } },
      }),
      this.prisma.backgroundFeature.count({ where }),
    ]);
    return {
      total,
      hits: rows.map(r => ({
        kind: 'background' as const,
        id: r.id,
        name: r.name,
        description: r.description,
        parent: { id: r.background.id, name: r.background.name },
      })),
    };
  }

  // ── Feature hydration by id (unified across the four feature tables) ──
  //
  // Resolves bare feature ids — no parent kind attached — by probing all four
  // feature tables in parallel. Used by the printable-cards batch endpoint,
  // whose clients only hold { type: 'feature', id } pairs. Unknown ids simply
  // produce no row. Results are ordered class → subclass → race → background,
  // matching the unified-search source order; callers needing request order
  // re-sort by id.

  async findFeaturesByIds(ids: string[]): Promise<UnifiedFeatureData[]> {
    if (ids.length === 0) return [];

    const where = { id: { in: ids } };
    const [classFeatures, subclassFeatures, raceTraits, backgroundFeatures] = await Promise.all([
      this.prisma.classFeature.findMany({
        where,
        include: { class: { select: { id: true, name: true } } },
      }),
      this.prisma.subclassFeature.findMany({
        where,
        include: { subclass: { select: { id: true, name: true } } },
      }),
      this.prisma.raceTrait.findMany({
        where,
        include: { race: { select: { id: true, name: true } } },
      }),
      this.prisma.backgroundFeature.findMany({
        where,
        include: { background: { select: { id: true, name: true } } },
      }),
    ]);

    return [
      ...classFeatures.map(r => ({
        id: r.id,
        name: r.name,
        level: r.level,
        description: r.description,
        parent: { kind: 'class' as const, id: r.class.id, name: r.class.name },
      })),
      ...subclassFeatures.map(r => ({
        id: r.id,
        name: r.name,
        level: r.level,
        description: r.description,
        parent: { kind: 'subclass' as const, id: r.subclass.id, name: r.subclass.name },
      })),
      ...raceTraits.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        parent: { kind: 'race' as const, id: r.race.id, name: r.race.name },
      })),
      ...backgroundFeatures.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        parent: { kind: 'background' as const, id: r.background.id, name: r.background.name },
      })),
    ];
  }

  // ── Feats ───────────────────────────────────────────

  // Feat reads take an optional userId (VEG-295): authenticated callers see
  // the global catalog plus their own homebrew; anonymous callers see only the
  // catalog. The visibility fragment can itself be an OR, so a free-text query
  // joins it under AND instead of clobbering it.
  async searchFeats(dto: QueryFeatsDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const visible = this.contentAccess.visibleTo(userId);
    const where: Record<string, unknown> = dto.q
      ? {
          AND: [
            { ...visible },
            {
              OR: [
                { name: { contains: dto.q, mode: 'insensitive' } },
                { description: { contains: dto.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : { ...visible };
    if (dto.category) where.category = dto.category;
    if (dto.hasPrerequisite === 'true') where.prerequisite = { not: null };
    else if (dto.hasPrerequisite === 'false') where.prerequisite = null;
    if (dto.repeatable === 'true') where.repeatable = true;
    else if (dto.repeatable === 'false') where.repeatable = false;

    const [data, total] = await Promise.all([
      this.prisma.feat.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.feat.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findFeat(id: string, userId?: string) {
    return this.prisma.feat.findFirst({
      where: { id, ...this.contentAccess.visibleTo(userId) },
    });
  }

  // ── Conditions ──────────────────────────────────────

  async findAllConditions() {
    return this.prisma.condition.findMany({ orderBy: { name: 'asc' } });
  }

  async findCondition(id: string) {
    return this.prisma.condition.findUnique({ where: { id } });
  }

  // ── Skills ──────────────────────────────────────────

  async searchSkills(ability?: string) {
    const where: Record<string, unknown> = {};
    if (ability) where.ability = ability;
    return this.prisma.skill.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSkill(id: string) {
    return this.prisma.skill.findUnique({ where: { id } });
  }

  // ── Languages ───────────────────────────────────────

  async searchLanguages(type?: string) {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    return this.prisma.language.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findLanguage(id: string) {
    return this.prisma.language.findUnique({ where: { id } });
  }

  // ── Game Rules ─────────────────────────────────────

  async findAllRules() {
    return this.prisma.gameRule.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  async findRulesByCategory(category: string) {
    return this.prisma.gameRule.findMany({
      where: { category },
      orderBy: { key: 'asc' },
    });
  }

  // ── Unified search (spells + feats + features) ──────
  //
  // Pagination happens at the SQL layer via UNION ALL + LIMIT/OFFSET so that
  // the catalog never has to be loaded into Node memory to slice a single page.
  // The flow is:
  //   1) UNION ALL across enabled sources, projecting only (source, id, name).
  //   2) Order by name, page with LIMIT/OFFSET — returns at most `limit` rows.
  //   3) Sum-of-counts query for the grand total.
  //   4) Hydrate full payloads by primary key per source.

  // Takes an optional userId (VEG-294/295/296): the spell, feat, and item
  // sources widen to the caller's own homebrew. Features stay pinned to the
  // global catalog — they have no homebrew tier.
  async search(dto: QuerySearchDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;
    const types: SearchKind[] = dto.types?.length
      ? dto.types
      : ['spell', 'feat', 'item', 'feature'];

    const sources = this.buildUnifiedSources(dto, types, userId);
    if (sources.length === 0) {
      return buildPaginatedResponse<UnifiedSearchHit>([], 0, page, limit);
    }

    const idSelectParts = sources.map(
      s => Prisma.sql`SELECT ${s.tag}::text AS source, "id", "name" FROM ${s.table} ${s.whereSql}`
    );
    const idQuery = Prisma.sql`SELECT source, id FROM (${Prisma.join(
      idSelectParts,
      ' UNION ALL '
    )}) AS u ORDER BY name ASC, source ASC, id ASC LIMIT ${limit} OFFSET ${offset}`;

    const countSelectParts = sources.map(
      s => Prisma.sql`SELECT COUNT(*)::int AS n FROM ${s.table} ${s.whereSql}`
    );
    const countQuery = Prisma.sql`SELECT COALESCE(SUM(n), 0)::int AS total FROM (${Prisma.join(
      countSelectParts,
      ' UNION ALL '
    )}) AS c`;

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<UnifiedIdRow[]>(idQuery),
      this.prisma.$queryRaw<{ total: number | null }[]>(countQuery),
    ]);
    const total = Number(countRows[0]?.total ?? 0);

    const data = await this.hydrateUnifiedHits(idRows);

    return buildPaginatedResponse<UnifiedSearchHit>(data, total, page, limit);
  }

  private buildUnifiedSources(
    dto: QuerySearchDto,
    types: SearchKind[],
    userId?: string
  ): UnifiedSource[] {
    const sources: UnifiedSource[] = [];
    if (types.includes('spell')) {
      sources.push({
        tag: 'spell',
        table: Prisma.sql`"spells"`,
        whereSql: this.buildSpellWhereSql(dto, userId),
      });
    }
    if (types.includes('feat')) {
      sources.push({
        tag: 'feat',
        table: Prisma.sql`"feats"`,
        whereSql: this.buildFeatWhereSql(dto, userId),
      });
    }
    if (types.includes('item')) {
      sources.push({
        tag: 'item',
        table: Prisma.sql`"items"`,
        whereSql: this.buildItemWhereSql(dto, userId),
      });
    }
    if (types.includes('feature')) {
      const parents = dto.parentType ? [dto.parentType] : ALL_FEATURE_PARENTS;
      for (const parent of parents) {
        sources.push({
          tag: FEATURE_TAG[parent],
          table: FEATURE_TABLE[parent],
          whereSql: this.buildFeatureWhereSql(dto, parent),
        });
      }
    }
    return sources;
  }

  private buildTextMatchSql(query: string): Prisma.Sql {
    const like = `%${query}%`;
    return Prisma.sql`("name" ILIKE ${like} OR "description" ILIKE ${like})`;
  }

  private buildSpellWhereSql(dto: QuerySearchDto, userId?: string): Prisma.Sql {
    const conds: Prisma.Sql[] = [visibleSourceSql(userId)];
    if (dto.q) conds.push(this.buildTextMatchSql(dto.q));
    if (dto.class) conds.push(Prisma.sql`${dto.class} = ANY("classes")`);
    if (dto.level !== undefined) conds.push(Prisma.sql`"level" = ${dto.level}`);
    if (dto.school) conds.push(Prisma.sql`"school" = ${dto.school}`);
    return joinWhere(conds);
  }

  private buildFeatWhereSql(dto: QuerySearchDto, userId?: string): Prisma.Sql {
    const conds: Prisma.Sql[] = [visibleSourceSql(userId)];
    if (dto.q) conds.push(this.buildTextMatchSql(dto.q));
    if (dto.hasPrerequisite === 'true') conds.push(Prisma.sql`"prerequisite" IS NOT NULL`);
    else if (dto.hasPrerequisite === 'false') conds.push(Prisma.sql`"prerequisite" IS NULL`);
    if (dto.category) conds.push(Prisma.sql`"category" = ${dto.category}`);
    if (dto.repeatable === 'true') conds.push(Prisma.sql`"repeatable" = TRUE`);
    else if (dto.repeatable === 'false') conds.push(Prisma.sql`"repeatable" = FALSE`);
    return joinWhere(conds);
  }

  // `category` is shared between the feat and item sources (the client only
  // sends sub-filters when a single kind is selected); feat and item category
  // vocabularies don't overlap, so a stray cross-kind filter just matches
  // nothing rather than the wrong rows.
  private buildItemWhereSql(dto: QuerySearchDto, userId?: string): Prisma.Sql {
    const conds: Prisma.Sql[] = [visibleSourceSql(userId)];
    if (dto.q) conds.push(this.buildTextMatchSql(dto.q));
    if (dto.category) conds.push(Prisma.sql`"category" = ${dto.category}`);
    if (dto.rarity) conds.push(Prisma.sql`"rarity" = ${dto.rarity}`);
    if (dto.isMagic === 'true') conds.push(Prisma.sql`"isMagic" = TRUE`);
    else if (dto.isMagic === 'false') conds.push(Prisma.sql`"isMagic" = FALSE`);
    return joinWhere(conds);
  }

  private buildFeatureWhereSql(dto: QuerySearchDto, parent: FeatureParentType): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (dto.q) conds.push(this.buildTextMatchSql(dto.q));
    if (dto.parentId) {
      conds.push(Prisma.sql`${FEATURE_PARENT_COLUMN[parent]} = ${dto.parentId}`);
    }
    return joinWhere(conds);
  }

  // Ids that fail to hydrate (a row deleted between the id query and this
  // hydrate query) are silently dropped; `total` is computed independently,
  // so a page can briefly show one card fewer than the count. Accepted —
  // the race self-heals on the next query.
  private async hydrateUnifiedHits(idRows: UnifiedIdRow[]): Promise<UnifiedSearchHit[]> {
    const idsBySource: Record<UnifiedSourceTag, string[]> = {
      spell: [],
      feat: [],
      item: [],
      'feature:class': [],
      'feature:subclass': [],
      'feature:race': [],
      'feature:background': [],
    };
    for (const row of idRows) idsBySource[row.source].push(row.id);

    const [spells, feats, items, classFeatures, subclassFeatures, raceTraits, backgroundFeatures] =
      await Promise.all([
        idsBySource.spell.length
          ? this.prisma.spell.findMany({ where: { id: { in: idsBySource.spell } } })
          : Promise.resolve([] as Spell[]),
        idsBySource.feat.length
          ? this.prisma.feat.findMany({ where: { id: { in: idsBySource.feat } } })
          : Promise.resolve([] as Feat[]),
        idsBySource.item.length
          ? this.prisma.item.findMany({ where: { id: { in: idsBySource.item } } })
          : Promise.resolve([] as Item[]),
        idsBySource['feature:class'].length
          ? this.prisma.classFeature.findMany({
              where: { id: { in: idsBySource['feature:class'] } },
              include: { class: { select: { id: true, name: true } } },
            })
          : Promise.resolve([]),
        idsBySource['feature:subclass'].length
          ? this.prisma.subclassFeature.findMany({
              where: { id: { in: idsBySource['feature:subclass'] } },
              include: { subclass: { select: { id: true, name: true } } },
            })
          : Promise.resolve([]),
        idsBySource['feature:race'].length
          ? this.prisma.raceTrait.findMany({
              where: { id: { in: idsBySource['feature:race'] } },
              include: { race: { select: { id: true, name: true } } },
            })
          : Promise.resolve([]),
        idsBySource['feature:background'].length
          ? this.prisma.backgroundFeature.findMany({
              where: { id: { in: idsBySource['feature:background'] } },
              include: { background: { select: { id: true, name: true } } },
            })
          : Promise.resolve([]),
      ]);

    const spellMap = new Map(spells.map(s => [s.id, s]));
    const featMap = new Map(feats.map(f => [f.id, f]));
    const itemMap = new Map(items.map(i => [i.id, i]));
    const classFeatureMap = new Map(classFeatures.map(f => [f.id, f]));
    const subclassFeatureMap = new Map(subclassFeatures.map(f => [f.id, f]));
    const raceTraitMap = new Map(raceTraits.map(t => [t.id, t]));
    const backgroundFeatureMap = new Map(backgroundFeatures.map(f => [f.id, f]));

    const result: UnifiedSearchHit[] = [];
    for (const row of idRows) {
      switch (row.source) {
        case 'spell': {
          const data = spellMap.get(row.id);
          if (data) result.push({ kind: 'spell', data });
          break;
        }
        case 'feat': {
          const data = featMap.get(row.id);
          if (data) result.push({ kind: 'feat', data });
          break;
        }
        case 'item': {
          const data = itemMap.get(row.id);
          if (data) result.push({ kind: 'item', data });
          break;
        }
        case 'feature:class': {
          const r = classFeatureMap.get(row.id);
          if (r) {
            result.push({
              kind: 'feature',
              data: {
                id: r.id,
                name: r.name,
                level: r.level,
                description: r.description,
                parent: { kind: 'class', id: r.class.id, name: r.class.name },
              },
            });
          }
          break;
        }
        case 'feature:subclass': {
          const r = subclassFeatureMap.get(row.id);
          if (r) {
            result.push({
              kind: 'feature',
              data: {
                id: r.id,
                name: r.name,
                level: r.level,
                description: r.description,
                parent: { kind: 'subclass', id: r.subclass.id, name: r.subclass.name },
              },
            });
          }
          break;
        }
        case 'feature:race': {
          const r = raceTraitMap.get(row.id);
          if (r) {
            result.push({
              kind: 'feature',
              data: {
                id: r.id,
                name: r.name,
                description: r.description,
                parent: { kind: 'race', id: r.race.id, name: r.race.name },
              },
            });
          }
          break;
        }
        case 'feature:background': {
          const r = backgroundFeatureMap.get(row.id);
          if (r) {
            result.push({
              kind: 'feature',
              data: {
                id: r.id,
                name: r.name,
                description: r.description,
                parent: { kind: 'background', id: r.background.id, name: r.background.name },
              },
            });
          }
          break;
        }
      }
    }
    return result;
  }
}
