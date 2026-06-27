import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List campaigns for current user' })
  findAll(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto) {
    return this.campaignsService.findAllForUser(req.user.userId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.findOneForUser(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update campaign' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCampaignDto
  ) {
    return this.campaignsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete campaign' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.remove(id, req.user.userId);
  }

  @Post(':id/invite-code')
  @ApiOperation({ summary: 'Generate (or regenerate) invite code for campaign' })
  generateInviteCode(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService
      .generateInviteCode(id, req.user.userId)
      .then(code => ({ inviteCode: code }));
  }

  @Delete(':id/invite-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the active invite code for campaign' })
  revokeInviteCode(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.revokeInviteCode(id, req.user.userId);
  }

  @Post('join/:code')
  @ApiOperation({ summary: 'Join campaign by invite code' })
  joinByInviteCode(@Param('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.joinByInviteCode(code, req.user.userId);
  }

  @Get(':id/characters')
  @ApiOperation({ summary: 'List the campaign party roster (slim character projection)' })
  findCharacters(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.findCharactersForMember(id, req.user.userId);
  }

  @Get(':id/attachable-characters')
  @ApiOperation({
    summary: "List members' characters that can be attached to the campaign (owner only)",
  })
  findAttachableCharacters(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.campaignsService.findAttachableCharacters(id, req.user.userId);
  }

  @Post(':id/characters/:characterId')
  @ApiOperation({ summary: 'Add character to campaign' })
  addCharacter(
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.campaignsService.addCharacter(id, characterId, req.user.userId);
  }

  @Delete(':id/characters/:characterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove character from campaign' })
  removeCharacter(
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.campaignsService.removeCharacter(id, characterId, req.user.userId);
  }

  @Delete(':id/players/:playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove player from campaign' })
  removePlayer(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.campaignsService.removePlayer(id, playerId, req.user.userId);
  }
}
