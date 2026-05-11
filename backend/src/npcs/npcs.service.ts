import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { CreateNpcDto } from './dto/create-npc.dto';
import { UpdateNpcDto } from './dto/update-npc.dto';
import { NpcFilterDto } from './dto/npc-query.dto';
import { AddNpcRelationDto } from './dto/add-npc-relation.dto';
import { GenerateRelatedNpcDto } from './dto/generate-related-npc.dto';
import { inverseOf } from './relation-inverses';
import {
  adjustedAgeForRelation,
  extractFamilyName,
  pickChildRace,
  swapFamilyName,
} from './relation-constraints';
import { NpcGeneratorService } from './generator/npc-generator.service';
import {
  GeneratedNpc,
  NpcGenerationConstraints,
} from './generator/npc-generator.types';

const JSON_FIELDS = ['statBlock', 'loot', 'lootOverrides', 'generationParams'] as const;

type NpcJsonField = (typeof JSON_FIELDS)[number];

type NpcJsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

function extractJsonFields<T extends Partial<Record<NpcJsonField, unknown>>>(
  dto: T
): { rest: Omit<T, NpcJsonField>; jsonData: Partial<Record<NpcJsonField, NpcJsonValue>> } {
  const { statBlock, loot, lootOverrides, generationParams, ...rest } = dto as T &
    Record<NpcJsonField, unknown>;
  const jsonData: Partial<Record<NpcJsonField, NpcJsonValue>> = {};
  if (statBlock !== undefined) jsonData.statBlock = toJsonValue(statBlock);
  if (loot !== undefined) jsonData.loot = toJsonValue(loot);
  if (lootOverrides !== undefined) jsonData.lootOverrides = toJsonValue(lootOverrides);
  if (generationParams !== undefined) jsonData.generationParams = toJsonValue(generationParams);
  return { rest: rest as Omit<T, NpcJsonField>, jsonData };
}

function toJsonValue(v: unknown): NpcJsonValue {
  return v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

@Injectable()
export class NpcsService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService,
    private generator: NpcGeneratorService
  ) {}

  async create(userId: string, dto: CreateNpcDto) {
    await this.campaignAuth.assertCampaignOwner(dto.campaignId, userId);
    const { rest, jsonData } = extractJsonFields(dto);
    return this.prisma.npc.create({
      data: { ...rest, createdById: userId, ...jsonData },
    });
  }

  async findAllForCampaign(campaignId: string, userId: string, query: NpcFilterDto) {
    await this.campaignAuth.assertCampaignOwner(campaignId, userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NpcWhereInput = { campaignId };
    if (query.race) where.race = query.race;
    if (query.profession) where.profession = query.profession;

    const [data, total] = await Promise.all([
      this.prisma.npc.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.npc.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const relationInclude = {
      include: {
        toNpc: { select: { id: true, name: true, race: true } },
        fromNpc: { select: { id: true, name: true, race: true } },
      },
    } as const;
    const npc = await this.prisma.npc.findUnique({
      where: { id },
      include: { outgoingLinks: relationInclude, incomingLinks: relationInclude },
    });
    if (!npc) throw new NotFoundException(`Npc "${id}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    return npc;
  }

  async update(id: string, userId: string, dto: UpdateNpcDto) {
    const npc = await this.prisma.npc.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!npc) throw new NotFoundException(`Npc "${id}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    const { rest, jsonData } = extractJsonFields(dto);
    return this.prisma.npc.update({
      where: { id },
      data: { ...rest, ...jsonData },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const npc = await this.prisma.npc.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!npc) throw new NotFoundException(`Npc "${id}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    await this.prisma.npc.delete({ where: { id } });
  }

  async addRelation(npcId: string, userId: string, dto: AddNpcRelationDto) {
    if (npcId === dto.toNpcId) {
      throw new BadRequestException('An NPC cannot have a relation to itself');
    }
    const npc = await this.prisma.npc.findUnique({
      where: { id: npcId },
      select: { id: true, campaignId: true },
    });
    if (!npc) throw new NotFoundException(`Npc "${npcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    try {
      const [forward] = await this.prisma.$transaction(async tx => {
        const forwardData: Prisma.NpcRelationUncheckedCreateInput = {
          fromNpcId: npcId,
          toNpcId: dto.toNpcId,
          relation: dto.relation,
          ...(dto.notes !== undefined && { notes: dto.notes }),
        };
        const inverseData: Prisma.NpcRelationUncheckedCreateInput = {
          fromNpcId: dto.toNpcId,
          toNpcId: npcId,
          relation: inverseOf(dto.relation),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        };
        const forwardRow = await tx.npcRelation.create({ data: forwardData });
        const inverseRow = await tx.npcRelation.create({ data: inverseData });
        return [forwardRow, inverseRow];
      });
      return forward;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Relation already exists between these NPCs');
      }
      throw err;
    }
  }

  async removeRelation(npcId: string, relationId: string, userId: string): Promise<void> {
    const npc = await this.prisma.npc.findUnique({
      where: { id: npcId },
      select: { id: true, campaignId: true },
    });
    if (!npc) throw new NotFoundException(`Npc "${npcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    const relation = await this.prisma.npcRelation.findUnique({ where: { id: relationId } });
    if (!relation || relation.fromNpcId !== npcId) {
      throw new NotFoundException(`Relation "${relationId}" not found`);
    }
    await this.prisma.$transaction(async tx => {
      await tx.npcRelation.delete({ where: { id: relationId } });
      await tx.npcRelation.deleteMany({
        where: {
          fromNpcId: relation.toNpcId,
          toNpcId: relation.fromNpcId,
          relation: inverseOf(relation.relation),
        },
      });
    });
  }

  async generateRelated(sourceNpcId: string, userId: string, dto: GenerateRelatedNpcDto) {
    const source = await this.prisma.npc.findUnique({
      where: { id: sourceNpcId },
      include: {
        outgoingLinks: {
          where: { relation: 'spouse' },
          include: { toNpc: { select: { id: true, race: true } } },
        },
      },
    });
    if (!source) throw new NotFoundException(`Npc "${sourceNpcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(source.campaignId, userId);

    const relation = dto.relation;
    const override = dto.constraintsOverride ?? {};
    const spouseRace = source.outgoingLinks[0]?.toNpc?.race ?? null;

    // Pre-seed race based on relation rules. DM-supplied override always wins.
    const seededRace =
      relation === 'spouse'
        ? undefined
        : relation === 'child'
          ? pickChildRace(source.race, spouseRace)
          : ['parent', 'sibling'].includes(relation)
            ? source.race
            : undefined;

    const constraints: NpcGenerationConstraints = {
      campaignId: source.campaignId,
      ...(seededRace !== undefined && { race: seededRace }),
      ...override,
    };

    const generated = await this.generator.generate(userId, constraints);

    // Post-process: family name swap, adjacent age, mixed-race child metadata.
    const dmProvidedName = override.name !== undefined;
    const familyName =
      !dmProvidedName && ['parent', 'child', 'sibling'].includes(relation)
        ? extractFamilyName(source.name)
        : null;
    const finalName = familyName ? swapFamilyName(generated.name, familyName) : generated.name;

    const adjustedAge = adjustedAgeForRelation(source.age, relation, constraints.seed);
    const finalAge = adjustedAge ?? generated.age;

    const parentRaces: [string, string] | null =
      relation === 'child' && spouseRace ? [source.race, spouseRace] : null;
    const finalGenerationParams = parentRaces
      ? { ...generated.generationParams, parentRaces }
      : generated.generationParams;

    const finalPayload: GeneratedNpc = {
      ...generated,
      name: finalName,
      age: finalAge,
      generationParams: finalGenerationParams as GeneratedNpc['generationParams'],
    };

    return this.prisma.$transaction(async tx => {
      const npc = await tx.npc.create({
        data: this.toCreateData(finalPayload, userId),
      });
      await tx.npcRelation.create({
        data: { fromNpcId: npc.id, toNpcId: source.id, relation },
      });
      await tx.npcRelation.create({
        data: { fromNpcId: source.id, toNpcId: npc.id, relation: inverseOf(relation) },
      });
      return npc;
    });
  }

  private toCreateData(payload: GeneratedNpc, userId: string): Prisma.NpcUncheckedCreateInput {
    return {
      campaignId: payload.campaignId,
      createdById: userId,
      name: payload.name,
      race: payload.race,
      background: payload.background,
      profession: payload.profession,
      alignment: payload.alignment,
      size: payload.size,
      age: payload.age,
      gender: payload.gender,
      appearance: payload.appearance,
      personalityTraits: payload.personalityTraits,
      ideals: payload.ideals,
      bonds: payload.bonds,
      flaws: payload.flaws,
      statBlock:
        payload.statBlock === null
          ? Prisma.JsonNull
          : (payload.statBlock as unknown as Prisma.InputJsonValue),
      goldPieces: payload.goldPieces,
      silverPieces: payload.silverPieces,
      copperPieces: payload.copperPieces,
      loot: payload.loot as unknown as Prisma.InputJsonValue,
      lootOverrides:
        payload.lootOverrides === null
          ? Prisma.JsonNull
          : (payload.lootOverrides as unknown as Prisma.InputJsonValue),
      generationParams: payload.generationParams as unknown as Prisma.InputJsonValue,
    };
  }
}
