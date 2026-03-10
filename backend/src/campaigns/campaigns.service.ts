import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const campaignInclude = {
  players: true,
  characters: true,
} as const;

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCampaignDto) {
    return this.prisma.campaign.create({
      data: {
        ...dto,
        ownerId: userId,
        players: { create: { userId } },
      },
      include: campaignInclude,
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.campaign.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { players: { some: { userId } } },
        ],
      },
      include: campaignInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: campaignInclude,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign "${id}" not found`);
    }
    return campaign;
  }

  async findOneForUser(id: string, userId: string) {
    const campaign = await this.findOne(id);
    const isMember =
      campaign.ownerId === userId ||
      campaign.players.some((p) => p.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this campaign');
    }
    return campaign;
  }

  async update(id: string, userId: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOne(id);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can edit');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: dto,
      include: campaignInclude,
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const campaign = await this.findOne(id);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can delete');
    }
    await this.prisma.campaign.delete({ where: { id } });
  }

  async generateInviteCode(id: string, userId: string): Promise<string> {
    const campaign = await this.findOne(id);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can generate invite codes');
    }
    const code = crypto.randomBytes(4).toString('hex');
    await this.prisma.campaign.update({
      where: { id },
      data: { inviteCode: code },
    });
    return code;
  }

  async joinByInviteCode(code: string, userId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { inviteCode: code },
      include: campaignInclude,
    });
    if (!campaign) {
      throw new NotFoundException('Invalid invite code');
    }
    await this.prisma.campaignPlayer.upsert({
      where: {
        campaignId_userId: { campaignId: campaign.id, userId },
      },
      create: { campaignId: campaign.id, userId },
      update: {},
    });
    return this.findOne(campaign.id);
  }

  async addCharacter(campaignId: string, characterId: string, userId: string) {
    await this.findOneForUser(campaignId, userId);
    await this.prisma.character.update({
      where: { id: characterId },
      data: { campaignId },
    });
    return this.findOne(campaignId);
  }

  async removeCharacter(campaignId: string, characterId: string, userId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can remove characters');
    }
    await this.prisma.character.update({
      where: { id: characterId },
      data: { campaignId: null },
    });
    return this.findOne(campaignId);
  }

  async removePlayer(campaignId: string, playerId: string, userId: string) {
    const campaign = await this.findOne(campaignId);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can remove players');
    }
    await this.prisma.campaignPlayer.delete({
      where: {
        campaignId_userId: { campaignId, userId: playerId },
      },
    });
    return this.findOne(campaignId);
  }
}
