import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NoteVisibility } from '../prisma/enums';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class NotesService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
  ) {}

  async create(userId: string, dto: CreateNoteDto) {
    await this.campaignAuth.assertCampaignMember(dto.campaignId, userId);
    return this.prisma.note.create({
      data: {
        ...dto,
        authorId: userId,
      },
    });
  }

  async findAllForCampaign(campaignId: string, userId: string) {
    const campaign = await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const isDm = campaign.ownerId === userId;

    if (isDm) {
      return this.prisma.note.findMany({
        where: { campaignId },
        orderBy: { updatedAt: 'desc' },
      });
    }

    return this.prisma.note.findMany({
      where: {
        campaignId,
        OR: [
          { visibility: NoteVisibility.PARTY },
          { authorId: userId, visibility: NoteVisibility.PRIVATE },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }

    const campaign = await this.campaignAuth.assertCampaignMember(note.campaignId, userId);
    const isDm = campaign.ownerId === userId;
    const isAuthor = note.authorId === userId;

    if (!isDm && !isAuthor && note.visibility !== NoteVisibility.PARTY) {
      throw new ForbiddenException('You do not have access to this note');
    }

    return note;
  }

  async update(id: string, userId: string, dto: UpdateNoteDto) {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }
    if (note.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this note');
    }
    return this.prisma.note.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }

    const campaign = await this.campaignAuth.findCampaignOrFail(note.campaignId);
    this.campaignAuth.assertAuthorOrDm(note.authorId, campaign.ownerId, userId);
    await this.prisma.note.delete({ where: { id } });
  }
}
