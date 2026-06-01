import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const campaignAuthSelect = {
  id: true,
  ownerId: true,
  players: { select: { userId: true } },
} as const;

export interface CampaignAuthShape {
  id: string;
  ownerId: string;
  players: { userId: string }[];
}

@Injectable()
export class CampaignAuthService {
  constructor(private prisma: PrismaService) {}

  async assertCampaignOwner(campaignId: string, userId: string) {
    const campaign = await this.findCampaignForAuth(campaignId);
    this.assertOwnerOnCampaign(campaign, userId);
    return campaign;
  }

  async assertCampaignMember(campaignId: string, userId: string) {
    const campaign = await this.findCampaignForAuth(campaignId);
    this.assertMemberOnCampaign(campaign, userId);
    return campaign;
  }

  assertOwnerOnCampaign(campaign: CampaignAuthShape, userId: string): void {
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can perform this action');
    }
  }

  assertMemberOnCampaign(campaign: CampaignAuthShape, userId: string): void {
    const isMember = campaign.ownerId === userId || campaign.players.some(p => p.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this campaign');
    }
  }

  assertAuthorOrDm(authorId: string, campaignOwnerId: string, userId: string): void {
    if (userId !== authorId && userId !== campaignOwnerId) {
      throw new ForbiddenException('Only the author or DM can delete this note');
    }
  }

  async findCampaignForAuth(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: campaignAuthSelect,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign "${id}" not found`);
    }
    return campaign;
  }
}
