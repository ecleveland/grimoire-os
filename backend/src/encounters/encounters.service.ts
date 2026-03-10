import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { CampaignsService } from '../campaigns/campaigns.service';

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private campaignsService: CampaignsService,
  ) {}

  async create(userId: string, dto: CreateEncounterDto) {
    const campaign = await this.campaignsService.findOneForUser(
      dto.campaignId,
      userId,
    );
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the DM can create encounters');
    }
    const { combatants, ...rest } = dto;
    return this.prisma.encounter.create({
      data: {
        ...rest,
        createdById: userId,
        combatants: combatants as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllForCampaign(campaignId: string, userId: string) {
    await this.campaignsService.findOneForUser(campaignId, userId);
    return this.prisma.encounter.findMany({
      where: { campaignId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    await this.campaignsService.findOneForUser(encounter.campaignId, userId);
    return encounter;
  }

  async update(id: string, userId: string, dto: UpdateEncounterDto) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
    });
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    const campaign = await this.campaignsService.findOne(encounter.campaignId);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the DM can update encounters');
    }
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
    const campaign = await this.campaignsService.findOne(encounter.campaignId);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the DM can delete encounters');
    }
    await this.prisma.encounter.delete({ where: { id } });
  }
}
