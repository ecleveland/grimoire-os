import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService, campaignAuthSelect } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { EncounterDto, EncounterListItemDto } from './dto/encounter-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';

// Slim projection for the encounters list view (VEG-125): drops currentTurn and
// createdById, which the list does not render.
const encounterListSelect = {
  id: true,
  campaignId: true,
  name: true,
  combatants: true,
  round: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EncounterSelect;

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
  ) {}

  async create(userId: string, dto: CreateEncounterDto) {
    await this.campaignAuth.assertCampaignOwner(dto.campaignId, userId);
    const { combatants, ...rest } = dto;
    const encounter = await this.prisma.encounter.create({
      data: {
        ...rest,
        createdById: userId,
        combatants: combatants as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(EncounterDto, encounter);
  }

  async findAllForCampaign(campaignId: string, userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const where = { campaignId };

    const [data, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where,
        select: encounterListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return buildPaginatedResponse(toDtoArray(EncounterListItemDto, data), total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const result = await this.prisma.encounter.findUnique({
      where: { id },
      include: { campaign: { select: campaignAuthSelect } },
    });
    if (!result) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    const { campaign, ...encounter } = result;
    this.campaignAuth.assertMemberOnCampaign(campaign, userId);
    return toDto(EncounterDto, encounter);
  }

  async update(id: string, userId: string, dto: UpdateEncounterDto) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
      select: {
        id: true,
        campaign: { select: campaignAuthSelect },
      },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    this.campaignAuth.assertOwnerOnCampaign(encounter.campaign, userId);
    const { combatants, expectedVersion, ...rest } = dto;
    const data = {
      ...rest,
      ...(combatants !== undefined && {
        combatants: combatants as unknown as Prisma.InputJsonValue,
      }),
    };

    // No expectedVersion → caller opts out of optimistic locking (VEG-137).
    if (expectedVersion === undefined) {
      const updated = await this.prisma.encounter.update({ where: { id }, data });
      return toDto(EncounterDto, updated);
    }

    // Guarded write: only succeeds if the row is still at expectedVersion.
    // `version` is non-unique, so updateMany with a compound where + atomic
    // increment is the correct primitive (plain update can't match on version).
    const { count } = await this.prisma.encounter.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.encounter.findUnique({
        where: { id },
        select: { version: true },
      });
      if (!current) {
        throw new NotFoundException(`Encounter "${id}" not found`);
      }
      throw new ConflictException({
        message: 'Encounter was modified by another request; re-fetch and retry.',
        currentVersion: current.version,
      });
    }
    const updated = await this.prisma.encounter.findUnique({ where: { id } });
    if (!updated) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    return toDto(EncounterDto, updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
      select: {
        id: true,
        campaign: { select: campaignAuthSelect },
      },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    this.campaignAuth.assertOwnerOnCampaign(encounter.campaign, userId);
    await this.prisma.encounter.delete({ where: { id } });
  }
}
