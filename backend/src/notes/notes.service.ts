import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NoteVisibility } from '../prisma/enums';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
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

  async findAllForCampaign(campaignId: string, userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const campaign = await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const isDm = campaign.ownerId === userId;

    const where: Prisma.NoteWhereInput = isDm
      ? { campaignId }
      : {
          campaignId,
          OR: [
            { visibility: NoteVisibility.PARTY },
            { authorId: userId, visibility: NoteVisibility.PRIVATE },
          ],
        };

    const [data, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.note.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
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
    const note = await this.prisma.note.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
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
    const note = await this.prisma.note.findUnique({
      where: { id },
      select: { id: true, authorId: true, campaignId: true },
    });
    if (!note) {
      throw new NotFoundException(`Note "${id}" not found`);
    }

    const campaign = await this.campaignAuth.findCampaignForAuth(note.campaignId);
    this.campaignAuth.assertAuthorOrDm(note.authorId, campaign.ownerId, userId);
    await this.prisma.note.delete({ where: { id } });
  }
}
