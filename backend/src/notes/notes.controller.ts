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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@ApiTags('Notes')
@ApiBearerAuth()
@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateNoteDto) {
    return this.notesService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List notes for a campaign' })
  findAll(
    @Query('campaignId') campaignId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notesService.findAllForCampaign(campaignId, req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get note by ID' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update note' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete note' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notesService.remove(id, req.user.userId);
  }
}
