import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
  ) {}

  async create(userId: string, dto: CreateEncounterDto) {
    await this.campaignAuth.assertCampaignOwner(dto.campaignId, userId);
    const { combatants, ...rest } = dto;
    return this.prisma.encounter.create({
      data: {
        ...rest,
        createdById: userId,
        combatants: combatants as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllForCampaign(campaignId: string, userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const where = { campaignId };

    const [data, total] = await Promise.all([
      this.prisma.encounter.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.encounter.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    await this.campaignAuth.assertCampaignMember(encounter.campaignId, userId);
    return encounter;
  }

  async update(id: string, userId: string, dto: UpdateEncounterDto) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    await this.campaignAuth.assertCampaignOwner(encounter.campaignId, userId);
    const { combatants, ...rest } = dto;
    return this.prisma.encounter.update({
      where: { id },
      data: {
        ...rest,
        ...(combatants !== undefined && {
          combatants: combatants as unknown as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    await this.campaignAuth.assertCampaignOwner(encounter.campaignId, userId);
    await this.prisma.encounter.delete({ where: { id } });
  }
}
