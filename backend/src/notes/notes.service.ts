import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Note, NoteDocument, NoteVisibility } from './schemas/note.schema';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { CampaignsService } from '../campaigns/campaigns.service';

@Injectable()
export class NotesService {
  constructor(
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
    private campaignsService: CampaignsService,
  ) {}

  async create(userId: string, dto: CreateNoteDto): Promise<NoteDocument> {
    await this.campaignsService.findOneForUser(dto.campaignId, userId);
    const note = new this.noteModel({
      ...dto,
      campaignId: new Types.ObjectId(dto.campaignId),
      authorId: new Types.ObjectId(userId),
    });
    return note.save();
  }

  async findAllForCampaign(
    campaignId: string,
    userId: string,
  ): Promise<NoteDocument[]> {
    const campaign = await this.campaignsService.findOneForUser(
      campaignId,
      userId,
    );
    const isDm = campaign.ownerId.equals(new Types.ObjectId(userId));
    const oid = new Types.ObjectId(userId);

    let filter: Record<string, unknown>;
    if (isDm) {
      filter = { campaignId: new Types.ObjectId(campaignId) };
    } else {
      filter = {
        campaignId: new Types.ObjectId(campaignId),
        $or: [
          { visibility: NoteVisibility.PARTY },
          { authorId: oid, visibility: NoteVisibility.PRIVATE },
        ],
      };
    }

    return this.noteModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string, userId: string): Promise<NoteDocument> {
    const note = await this.noteModel.findById(id).exec();
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }

    const campaign = await this.campaignsService.findOneForUser(
      note.campaignId.toString(),
      userId,
    );
    const isDm = campaign.ownerId.equals(new Types.ObjectId(userId));
    const isAuthor = note.authorId.equals(new Types.ObjectId(userId));

    if (
      !isDm &&
      !isAuthor &&
      note.visibility !== NoteVisibility.PARTY
    ) {
      throw new ForbiddenException('You do not have access to this note');
    }

    return note;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteDocument> {
    const note = await this.noteModel.findById(id).exec();
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }
    if (!note.authorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the author can edit this note');
    }
    Object.assign(note, dto);
    return note.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const note = await this.noteModel.findById(id).exec();
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }

    const campaign = await this.campaignsService.findOne(
      note.campaignId.toString(),
    );
    const isDm = campaign.ownerId.equals(new Types.ObjectId(userId));
    const isAuthor = note.authorId.equals(new Types.ObjectId(userId));

    if (!isDm && !isAuthor) {
      throw new ForbiddenException('Only the author or DM can delete this note');
    }
    await this.noteModel.findByIdAndDelete(id).exec();
  }
}
