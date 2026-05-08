import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { QuerySpellsDto } from './dto/query-spells.dto';
import { QueryMonstersDto } from './dto/query-monsters.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { QueryFeaturesDto, FeatureParentType } from './dto/query-features.dto';
import { QuerySearchDto, SearchKind } from './dto/query-search.dto';

export type UnifiedSearchHit =
  | { kind: 'spell'; id: string; name: string; level: number; school: string; description: string }
  | {
      kind: 'feat';
      id: string;
      name: string;
      prerequisite: string | null;
      description: string;
    }
  | {
      kind: 'feature';
      id: string;
      name: string;
      level?: number;
      description: string;
      parent: { kind: FeatureParentType; id: string; name: string };
    };

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

@Injectable()
export class SrdService {
  constructor(private prisma: PrismaService) {}

  // ── Spells ──────────────────────────────────────────

  async searchSpells(dto: QuerySpellsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
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

  async findSpell(id: string) {
    return this.prisma.spell.findUnique({ where: { id } });
  }

  // ── Monsters ────────────────────────────────────────

  async searchMonsters(dto: QueryMonstersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
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

  async findMonster(id: string) {
    return this.prisma.monster.findUnique({ where: { id } });
  }

  // ── Items ───────────────────────────────────────────

  async searchItems(dto: QueryItemsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
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

  async findItem(id: string) {
    return this.prisma.item.findUnique({ where: { id } });
  }

  // ── Classes ─────────────────────────────────────────

  async findAllClasses() {
    return this.prisma.srdClass.findMany({
      orderBy: { name: 'asc' },
      include: { features: { orderBy: CLASS_FEATURE_ORDER } },
    });
  }

  async findClass(id: string) {
    return this.prisma.srdClass.findUnique({
      where: { id },
      include: {
        subclasses: {
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

  async searchSubclasses(classId?: string) {
    const where: Record<string, unknown> = {};
    if (classId) where.classId = classId;
    return this.prisma.subclass.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { features: { orderBy: SUBCLASS_FEATURE_ORDER } },
    });
  }

  async findSubclass(id: string) {
    return this.prisma.subclass.findUnique({
      where: { id },
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

  async searchBackgrounds(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.background.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findBackground(id: string) {
    return this.prisma.background.findUnique({
      where: { id },
      include: { features: { orderBy: NAME_ORDER } },
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

  // ── Feats ───────────────────────────────────────────

  async searchFeats(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.feat.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findFeat(id: string) {
    return this.prisma.feat.findUnique({ where: { id } });
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

  async search(dto: QuerySearchDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const types: SearchKind[] = dto.types?.length ? dto.types : ['spell', 'feat', 'feature'];

    const tasks: Promise<{ hits: UnifiedSearchHit[]; total: number }>[] = [];
    if (types.includes('spell')) tasks.push(this.searchSpellsForUnion(dto));
    if (types.includes('feat')) tasks.push(this.searchFeatsForUnion(dto));
    if (types.includes('feature')) tasks.push(this.searchFeaturesForUnion(dto));

    const results = await Promise.all(tasks);
    const allHits = results.flatMap(r => r.hits);
    const total = results.reduce((sum, r) => sum + r.total, 0);

    allHits.sort((a, b) => a.name.localeCompare(b.name));
    const start = (page - 1) * limit;
    const data = allHits.slice(start, start + limit);

    return buildPaginatedResponse<UnifiedSearchHit>(data, total, page, limit);
  }

  private async searchSpellsForUnion(
    dto: QuerySearchDto
  ): Promise<{ hits: UnifiedSearchHit[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.class) where.classes = { has: dto.class };
    if (dto.level !== undefined) where.level = dto.level;
    if (dto.school) where.school = dto.school;

    const [rows, total] = await Promise.all([
      this.prisma.spell.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.spell.count({ where }),
    ]);

    return {
      total,
      hits: rows.map(
        (r): UnifiedSearchHit => ({
          kind: 'spell',
          id: r.id,
          name: r.name,
          level: r.level,
          school: r.school,
          description: r.description,
        })
      ),
    };
  }

  private async searchFeatsForUnion(
    dto: QuerySearchDto
  ): Promise<{ hits: UnifiedSearchHit[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.hasPrerequisite === 'true') where.prerequisite = { not: null };
    else if (dto.hasPrerequisite === 'false') where.prerequisite = null;

    const [rows, total] = await Promise.all([
      this.prisma.feat.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.feat.count({ where }),
    ]);

    return {
      total,
      hits: rows.map(
        (r): UnifiedSearchHit => ({
          kind: 'feat',
          id: r.id,
          name: r.name,
          prerequisite: r.prerequisite ?? null,
          description: r.description ?? '',
        })
      ),
    };
  }

  private async searchFeaturesForUnion(
    dto: QuerySearchDto
  ): Promise<{ hits: UnifiedSearchHit[]; total: number }> {
    const parents: FeatureParentType[] = dto.parentType
      ? [dto.parentType]
      : ['class', 'subclass', 'race', 'background'];

    const orFilter = dto.q
      ? {
          OR: [
            { name: { contains: dto.q, mode: 'insensitive' as const } },
            { description: { contains: dto.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const queries = await Promise.all(
      parents.map(p => this.searchFeatureTableForUnion(p, orFilter, dto.parentId))
    );

    return {
      hits: queries.flatMap(q => q.hits),
      total: queries.reduce((sum, q) => sum + q.total, 0),
    };
  }

  private async searchFeatureTableForUnion(
    kind: FeatureParentType,
    matchFilter: Record<string, unknown>,
    parentId: string | undefined
  ): Promise<{ hits: UnifiedSearchHit[]; total: number }> {
    if (kind === 'class') {
      const where = { ...matchFilter, ...(parentId ? { classId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.classFeature.findMany({
          where,
          include: { class: { select: { id: true, name: true } } },
        }),
        this.prisma.classFeature.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(
          (r): UnifiedSearchHit => ({
            kind: 'feature',
            id: r.id,
            name: r.name,
            level: r.level,
            description: r.description,
            parent: { kind: 'class', id: r.class.id, name: r.class.name },
          })
        ),
      };
    }
    if (kind === 'subclass') {
      const where = { ...matchFilter, ...(parentId ? { subclassId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.subclassFeature.findMany({
          where,
          include: { subclass: { select: { id: true, name: true } } },
        }),
        this.prisma.subclassFeature.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(
          (r): UnifiedSearchHit => ({
            kind: 'feature',
            id: r.id,
            name: r.name,
            level: r.level,
            description: r.description,
            parent: { kind: 'subclass', id: r.subclass.id, name: r.subclass.name },
          })
        ),
      };
    }
    if (kind === 'race') {
      const where = { ...matchFilter, ...(parentId ? { raceId: parentId } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.raceTrait.findMany({
          where,
          include: { race: { select: { id: true, name: true } } },
        }),
        this.prisma.raceTrait.count({ where }),
      ]);
      return {
        total,
        hits: rows.map(
          (r): UnifiedSearchHit => ({
            kind: 'feature',
            id: r.id,
            name: r.name,
            description: r.description,
            parent: { kind: 'race', id: r.race.id, name: r.race.name },
          })
        ),
      };
    }
    const where = { ...matchFilter, ...(parentId ? { backgroundId: parentId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.backgroundFeature.findMany({
        where,
        include: { background: { select: { id: true, name: true } } },
      }),
      this.prisma.backgroundFeature.count({ where }),
    ]);
    return {
      total,
      hits: rows.map(
        (r): UnifiedSearchHit => ({
          kind: 'feature',
          id: r.id,
          name: r.name,
          description: r.description,
          parent: { kind: 'background', id: r.background.id, name: r.background.name },
        })
      ),
    };
  }
}
