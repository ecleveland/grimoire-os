import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { NoteVisibility } from '../prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignDto, CampaignListItemDto, PartyCharacterDto } from './dto/campaign-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';

const campaignInclude = {
  players: true,
  characters: true,
} as const;

// Slim projection for the campaigns list view (VEG-125): only the scalar fields
// the list renders, plus player userIds for the member count. Notably omits the
// full players/characters rows and the invite code.
const campaignListSelect = {
  id: true,
  name: true,
  description: true,
  ownerId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  players: { select: { userId: true } },
} satisfies Prisma.CampaignSelect;

function serialize(campaign: any): CampaignDto {
  const { players, characters, ...rest } = campaign;
  return toDto(CampaignDto, {
    ...rest,
    playerIds: players?.map((p: any) => p.userId) ?? [],
    characterIds: characters?.map((c: any) => c.id) ?? [],
  });
}

function serializeListItem(campaign: any): CampaignListItemDto {
  const { players, ...rest } = campaign;
  return toDto(CampaignListItemDto, {
    ...rest,
    playerIds: players?.map((p: any) => p.userId) ?? [],
  });
}

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
  ) {}

  async create(userId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.campaign.create({
      data: {
        ...dto,
        ownerId: userId,
        players: { create: { userId } },
      },
      include: campaignInclude,
    });
    return serialize(campaign);
  }

  async findAllForUser(userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = {
      OR: [{ ownerId: userId }, { players: { some: { userId } } }],
    };

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        select: campaignListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return buildPaginatedResponse(campaigns.map(serializeListItem), total, page, limit);
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: campaignInclude,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign "${id}" not found`);
    }
    return serialize(campaign);
  }

  async findOneForUser(id: string, userId: string) {
    await this.campaignAuth.assertCampaignMember(id, userId);
    return this.findOne(id);
  }

  async update(id: string, userId: string, dto: UpdateCampaignDto) {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: dto,
      include: campaignInclude,
    });
    return serialize(campaign);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    await this.prisma.campaign.delete({ where: { id } });
  }

  static readonly INVITE_CODE_TTL_MS = 48 * 60 * 60 * 1000;

  async generateInviteCode(id: string, userId: string): Promise<string> {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    const code = crypto.randomBytes(16).toString('hex');
    const inviteCodeExpiresAt = new Date(Date.now() + CampaignsService.INVITE_CODE_TTL_MS);
    await this.prisma.campaign.update({
      where: { id },
      data: { inviteCode: code, inviteCodeExpiresAt },
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
    if (campaign.inviteCodeExpiresAt && campaign.inviteCodeExpiresAt.getTime() <= Date.now()) {
      throw new GoneException('Invite code has expired');
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

  async revokeInviteCode(id: string, userId: string): Promise<void> {
    await this.campaignAuth.assertCampaignOwner(id, userId);
    await this.prisma.campaign.update({
      where: { id },
      data: { inviteCode: null, inviteCodeExpiresAt: null },
    });
  }

  /**
   * Party roster for the encounter tracker (VEG-283): every character attached
   * to the campaign, projected down to the combatant-relevant fields. Member
   * read — the full sheets stay owner-only via GET /characters/:id.
   */
  async findCharactersForMember(campaignId: string, userId: string): Promise<PartyCharacterDto[]> {
    await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const characters = await this.prisma.character.findMany({
      where: { campaignId },
      orderBy: { name: 'asc' },
    });
    return toDtoArray(PartyCharacterDto, characters);
  }

  async addCharacter(campaignId: string, characterId: string, userId: string) {
    const campaign = await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, userId: true },
    });
    if (!character) {
      throw new NotFoundException(`Character "${characterId}" not found`);
    }
    // A plain member may only attach their own character. The campaign owner
    // (DM) may attach any member's character — but not an outsider's: the
    // character's owner must belong to the campaign, otherwise a DM could
    // conscript a stranger's character by ID and yank it out of its real
    // campaign (VEG-317).
    const isOwner = campaign.ownerId === userId;
    if (!isOwner && character.userId !== userId) {
      throw new ForbiddenException('You can only add your own characters to a campaign');
    }
    const characterOwnerIsMember =
      character.userId === campaign.ownerId ||
      campaign.players.some(p => p.userId === character.userId);
    if (!characterOwnerIsMember) {
      throw new ForbiddenException("You can only add a campaign member's character");
    }
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

    // Cascade the removed player's campaign-scoped cleanup atomically so a
    // partial failure rolls everything back (VEG-138).
    //
    // Encounter combatants (ticket step 3) are intentionally NOT cleaned up
    // here: the embedded `Combatant` shape carries no characterId/userId, so
    // there is no reliable key to identify the removed player's entries.
    // Deferred to a follow-up once combatants gain a linkage field.
    await this.prisma.$transaction(async tx => {
      // 1. Detach (do not delete) the player's characters from this campaign;
      //    characters belong to the user, so they survive but leave the campaign.
      await tx.character.updateMany({
        where: { campaignId, userId: playerId },
        data: { campaignId: null },
      });

      // 2. Delete the player's private notes in this campaign. Party-visible
      //    notes are shared content and are left in place.
      await tx.note.deleteMany({
        where: {
          campaignId,
          authorId: playerId,
          visibility: NoteVisibility.PRIVATE,
        },
      });

      // 4. Delete the membership join row.
      await tx.campaignPlayer.delete({
        where: {
          campaignId_userId: { campaignId, userId: playerId },
        },
      });
    });

    return this.findOne(campaignId);
  }
}
