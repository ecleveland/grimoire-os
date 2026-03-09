import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
  ) {}

  async create(
    userId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignDocument> {
    const campaign = new this.campaignModel({
      ...dto,
      ownerId: new Types.ObjectId(userId),
      playerIds: [new Types.ObjectId(userId)],
    });
    return campaign.save();
  }

  async findAllForUser(userId: string): Promise<CampaignDocument[]> {
    const oid = new Types.ObjectId(userId);
    return this.campaignModel
      .find({ $or: [{ ownerId: oid }, { playerIds: oid }] })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign "${id}" not found`);
    }
    return campaign;
  }

  async findOneForUser(
    id: string,
    userId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.findOne(id);
    const oid = new Types.ObjectId(userId);
    const isMember =
      campaign.ownerId.equals(oid) ||
      campaign.playerIds.some((pid) => pid.equals(oid));
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this campaign');
    }
    return campaign;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignDocument> {
    const campaign = await this.findOne(id);
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the campaign owner can edit');
    }
    Object.assign(campaign, dto);
    return campaign.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const campaign = await this.findOne(id);
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the campaign owner can delete');
    }
    await this.campaignModel.findByIdAndDelete(id).exec();
  }

  async generateInviteCode(
    id: string,
    userId: string,
  ): Promise<string> {
    const campaign = await this.findOne(id);
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the campaign owner can generate invite codes');
    }
    const code = crypto.randomBytes(4).toString('hex');
    campaign.inviteCode = code;
    await campaign.save();
    return code;
  }

  async joinByInviteCode(
    code: string,
    userId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.campaignModel
      .findOne({ inviteCode: code })
      .exec();
    if (!campaign) {
      throw new NotFoundException('Invalid invite code');
    }
    const oid = new Types.ObjectId(userId);
    if (!campaign.playerIds.some((pid) => pid.equals(oid))) {
      campaign.playerIds.push(oid);
      await campaign.save();
    }
    return campaign;
  }

  async addCharacter(
    campaignId: string,
    characterId: string,
    userId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.findOneForUser(campaignId, userId);
    const cid = new Types.ObjectId(characterId);
    if (!campaign.characterIds.some((id) => id.equals(cid))) {
      campaign.characterIds.push(cid);
      await campaign.save();
    }
    return campaign;
  }

  async removeCharacter(
    campaignId: string,
    characterId: string,
    userId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.findOne(campaignId);
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the campaign owner can remove characters');
    }
    campaign.characterIds = campaign.characterIds.filter(
      (id) => !id.equals(new Types.ObjectId(characterId)),
    );
    await campaign.save();
    return campaign;
  }

  async removePlayer(
    campaignId: string,
    playerId: string,
    userId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.findOne(campaignId);
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the campaign owner can remove players');
    }
    campaign.playerIds = campaign.playerIds.filter(
      (id) => !id.equals(new Types.ObjectId(playerId)),
    );
    await campaign.save();
    return campaign;
  }
}
