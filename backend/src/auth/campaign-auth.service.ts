import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const campaignInclude = {
  players: true,
  characters: true,
} as const;

@Injectable()
export class CampaignAuthService {
  constructor(private prisma: PrismaService) {}

  async assertCampaignOwner(campaignId: string, userId: string) {
    const campaign = await this.findCampaignOrFail(campaignId);
    if (campaign.ownerId !== userId) {
      throw new ForbiddenException('Only the campaign owner can perform this action');
    }
    return campaign;
  }

  async assertCampaignMember(campaignId: string, userId: string) {
    const campaign = await this.findCampaignOrFail(campaignId);
    const isMember = campaign.ownerId === userId ||
      campaign.players.some(p => p.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this campaign');
    }
    return campaign;
  }

  async findCampaignOrFail(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: campaignInclude,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign "${id}" not found`);
    }
    return campaign;
  }
}
