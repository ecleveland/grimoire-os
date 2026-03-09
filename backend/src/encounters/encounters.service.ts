import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Encounter, EncounterDocument } from './schemas/encounter.schema';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { CampaignsService } from '../campaigns/campaigns.service';

@Injectable()
export class EncountersService {
  constructor(
    @InjectModel(Encounter.name)
    private encounterModel: Model<EncounterDocument>,
    private campaignsService: CampaignsService,
  ) {}

  async create(
    userId: string,
    dto: CreateEncounterDto,
  ): Promise<EncounterDocument> {
    const campaign = await this.campaignsService.findOneForUser(
      dto.campaignId,
      userId,
    );
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the DM can create encounters');
    }
    const encounter = new this.encounterModel({
      ...dto,
      campaignId: new Types.ObjectId(dto.campaignId),
      createdBy: new Types.ObjectId(userId),
    });
    return encounter.save();
  }

  async findAllForCampaign(
    campaignId: string,
    userId: string,
  ): Promise<EncounterDocument[]> {
    await this.campaignsService.findOneForUser(campaignId, userId);
    return this.encounterModel
      .find({ campaignId: new Types.ObjectId(campaignId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string, userId: string): Promise<EncounterDocument> {
    const encounter = await this.encounterModel.findById(id).exec();
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    await this.campaignsService.findOneForUser(
      encounter.campaignId.toString(),
      userId,
    );
    return encounter;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateEncounterDto,
  ): Promise<EncounterDocument> {
    const encounter = await this.encounterModel.findById(id).exec();
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    const campaign = await this.campaignsService.findOne(
      encounter.campaignId.toString(),
    );
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the DM can update encounters');
    }
    Object.assign(encounter, dto);
    return encounter.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const encounter = await this.encounterModel.findById(id).exec();
    if (!encounter) {
      throw new NotFoundException(`Encounter "${id}" not found`);
    }
    const campaign = await this.campaignsService.findOne(
      encounter.campaignId.toString(),
    );
    if (!campaign.ownerId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the DM can delete encounters');
    }
    await this.encounterModel.findByIdAndDelete(id).exec();
  }
}
