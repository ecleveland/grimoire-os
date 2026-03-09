import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Character, CharacterDocument } from './schemas/character.schema';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@Injectable()
export class CharactersService {
  constructor(
    @InjectModel(Character.name)
    private characterModel: Model<CharacterDocument>,
  ) {}

  async create(
    userId: string,
    dto: CreateCharacterDto,
  ): Promise<CharacterDocument> {
    const character = new this.characterModel({
      ...dto,
      userId: new Types.ObjectId(userId),
      campaignId: dto.campaignId
        ? new Types.ObjectId(dto.campaignId)
        : undefined,
    });
    return character.save();
  }

  async findAllForUser(userId: string): Promise<CharacterDocument[]> {
    return this.characterModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<CharacterDocument> {
    const character = await this.characterModel.findById(id).exec();
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    return character;
  }

  async findOneForUser(
    id: string,
    userId: string,
  ): Promise<CharacterDocument> {
    const character = await this.findOne(id);
    if (!character.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCharacterDto,
  ): Promise<CharacterDocument> {
    const character = await this.findOneForUser(id, userId);
    Object.assign(character, dto);
    if (dto.campaignId !== undefined) {
      character.campaignId = dto.campaignId
        ? new Types.ObjectId(dto.campaignId)
        : undefined;
    }
    return character.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const character = await this.findOneForUser(id, userId);
    await this.characterModel.findByIdAndDelete(character._id).exec();
  }
}
