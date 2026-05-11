import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { NpcsService } from './npcs.service';
import { NpcGeneratorService } from './generator/npc-generator.service';
import { CreateNpcDto } from './dto/create-npc.dto';
import { UpdateNpcDto } from './dto/update-npc.dto';
import { NpcQueryDto } from './dto/npc-query.dto';
import { AddNpcRelationDto } from './dto/add-npc-relation.dto';
import { GenerateNpcDto } from './dto/generate-npc.dto';
import { GenerateRelatedNpcDto } from './dto/generate-related-npc.dto';
import { RerollNpcDto } from './dto/reroll-npc.dto';

@ApiTags('NPCs')
@ApiBearerAuth()
@Controller('npcs')
@UseGuards(JwtAuthGuard)
export class NpcsController {
  constructor(
    private readonly npcsService: NpcsService,
    private readonly generatorService: NpcGeneratorService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an NPC (manual or pre-generated payload)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateNpcDto) {
    return this.npcsService.create(req.user.userId, dto);
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate an NPC preview from constraints (does not save)',
  })
  generate(@Req() req: AuthenticatedRequest, @Body() dto: GenerateNpcDto) {
    return this.generatorService.generate(req.user.userId, dto);
  }

  @Post(':id/reroll')
  @ApiOperation({ summary: 'Re-roll a single field or all fields (honors lockedFields)' })
  reroll(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: RerollNpcDto) {
    return this.generatorService.reroll(id, req.user.userId, dto.field);
  }

  @Get()
  @ApiOperation({ summary: 'List NPCs for a campaign (paginated, DM-only)' })
  findAll(@Query() query: NpcQueryDto, @Req() req: AuthenticatedRequest) {
    return this.npcsService.findAllForCampaign(query.campaignId, req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get NPC by id with relations' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.npcsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update NPC (incl. lockedFields, lootOverrides)' })
  update(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: UpdateNpcDto) {
    return this.npcsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete NPC' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.npcsService.remove(id, req.user.userId);
  }

  @Post(':id/relations')
  @ApiOperation({ summary: 'Add relation from this NPC to another' })
  addRelation(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: AddNpcRelationDto
  ) {
    return this.npcsService.addRelation(id, req.user.userId, dto);
  }

  @Delete(':id/relations/:relationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a relation owned by this NPC' })
  removeRelation(
    @Param('id') id: string,
    @Param('relationId') relationId: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.npcsService.removeRelation(id, relationId, req.user.userId);
  }

  @Post(':id/relations/generate')
  @ApiOperation({
    summary: "Generate a new NPC related to this one and persist the relation pair atomically",
  })
  generateRelated(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateRelatedNpcDto
  ) {
    return this.npcsService.generateRelated(id, req.user.userId, dto);
  }
}
