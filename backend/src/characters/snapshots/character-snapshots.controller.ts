import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../auth/interfaces/jwt-payload.interface';
import { CharacterSnapshotsService } from './character-snapshots.service';

@ApiTags('Characters')
@ApiBearerAuth()
@Controller('characters/:id/snapshots')
@UseGuards(JwtAuthGuard)
export class CharacterSnapshotsController {
  constructor(private readonly snapshotsService: CharacterSnapshotsService) {}

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
