import {
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

const JSON_FIELDS = ['statBlock', 'loot', 'lootOverrides', 'generationParams'] as const;

type NpcJsonField = (typeof JSON_FIELDS)[number];

function extractJsonFields<T extends Partial<Record<NpcJsonField, unknown>>>(
  dto: T
): { rest: Omit<T, NpcJsonField>; jsonData: Partial<Record<NpcJsonField, Prisma.InputJsonValue>> } {
  const { statBlock, loot, lootOverrides, generationParams, ...rest } = dto as T &
    Record<NpcJsonField, unknown>;
  const jsonData: Partial<Record<NpcJsonField, Prisma.InputJsonValue>> = {};
  if (statBlock !== undefined) jsonData.statBlock = statBlock as Prisma.InputJsonValue;
  if (loot !== undefined) jsonData.loot = loot as Prisma.InputJsonValue;
  if (lootOverrides !== undefined) jsonData.lootOverrides = lootOverrides as Prisma.InputJsonValue;
  if (generationParams !== undefined)
    jsonData.generationParams = generationParams as Prisma.InputJsonValue;
  return { rest: rest as Omit<T, NpcJsonField>, jsonData };
}

@Injectable()
export class NpcsService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
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
    const npc = await this.prisma.npc.findUnique({
      where: { id },
      include: { outgoingLinks: true, incomingLinks: true },
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
    const npc = await this.prisma.npc.findUnique({
      where: { id: npcId },
      select: { id: true, campaignId: true },
    });
    if (!npc) throw new NotFoundException(`Npc "${npcId}" not found`);
    await this.campaignAuth.assertCampaignOwner(npc.campaignId, userId);
    try {
      return await this.prisma.npcRelation.create({
        data: {
          fromNpcId: npcId,
          toNpcId: dto.toNpcId,
          relation: dto.relation,
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
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
    await this.prisma.npcRelation.delete({ where: { id: relationId } });
  }
}
