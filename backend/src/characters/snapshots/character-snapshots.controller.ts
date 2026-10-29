import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../auth/interfaces/jwt-payload.interface';
import { CHARACTER_SNAPSHOT_CAP, CharacterSnapshotsService } from './character-snapshots.service';
import { CreateCharacterSnapshotDto } from './dto/create-character-snapshot.dto';
import { CopyCharacterSnapshotDto } from './dto/copy-character-snapshot.dto';
import { CharacterDto } from '../dto/character-response.dto';
import { CharacterSnapshotSummaryDto } from './dto/character-snapshot-response.dto';

@ApiTags('Characters')
@ApiBearerAuth()
@Controller('characters/:id/snapshots')
@UseGuards(JwtAuthGuard)
export class CharacterSnapshotsController {
  constructor(private readonly snapshotsService: CharacterSnapshotsService) {}

  @Post()
  @ApiOperation({ summary: 'Save a snapshot of the character as it stands now' })
  @ApiResponse({ status: 201, type: CharacterSnapshotSummaryDto })
  @ApiResponse({
    status: 400,
    description: `The character already has ${CHARACTER_SNAPSHOT_CAP} snapshots`,
  })
  create(
    @Param('id') id: string,
    @Body() dto: CreateCharacterSnapshotDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.snapshotsService.create(id, req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List a character's snapshots, newest first" })
  list(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.snapshotsService.list(id, req.user.userId);
  }

  @Get(':snapshotId')
  @ApiOperation({ summary: 'Get one snapshot with the character sheet as it stood' })
  get(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.snapshotsService.get(id, snapshotId, req.user.userId);
  }

  @Post(':snapshotId/copy')
  @ApiOperation({ summary: 'Create a new character from a snapshot' })
  @ApiResponse({ status: 201, type: CharacterDto })
  @ApiResponse({ status: 400, description: 'The stored sheet no longer passes validation' })
  @ApiResponse({
    status: 403,
    description: 'Not the owner of the character, or not a member of the campaign',
  })
  @ApiResponse({ status: 404, description: 'Character or snapshot not found' })
  copy(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Body() dto: CopyCharacterSnapshotDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.snapshotsService.copy(id, snapshotId, req.user.userId, dto);
  }

  @Delete(':snapshotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a snapshot' })
  @ApiResponse({ status: 204, description: 'Snapshot deleted' })
  remove(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.snapshotsService.remove(id, snapshotId, req.user.userId);
  }
}
