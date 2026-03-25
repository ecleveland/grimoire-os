import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const campaignInclude = {
  players: true,
  characters: true,
} as const;

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService,
  ) {}

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
        OR: [{ ownerId: userId }, { players: { some: { userId } } }],
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
    return this.campaignAuth.assertCampaignMember(id, userId);
  }

  async update(id: string, userId: string, dto: UpdateCampaignDto) {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    return this.prisma.campaign.update({
      where: { id },
      data: dto,
      include: campaignInclude,
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    await this.prisma.campaign.delete({ where: { id } });
  }

  async generateInviteCode(id: string, userId: string): Promise<string> {
    await this.campaignAuth.assertCampaignOwner(id, userId);
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
    await this.campaignAuth.assertCampaignOwner(campaignId, userId);
    await this.prisma.character.update({
      where: { id: characterId },
      data: { campaignId: null },
    });
    return this.findOne(campaignId);
  }

  async removePlayer(campaignId: string, playerId: string, userId: string) {
    await this.campaignAuth.assertCampaignOwner(campaignId, userId);
    await this.prisma.campaignPlayer.delete({
      where: {
        campaignId_userId: { campaignId, userId: playerId },
      },
    });
    return this.findOne(campaignId);
  }
}
