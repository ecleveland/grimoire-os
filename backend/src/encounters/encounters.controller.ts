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
import { EncountersService } from './encounters.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { QueryEncountersDto } from './dto/query-encounters.dto';

@ApiTags('Encounters')
@ApiBearerAuth()
@Controller('encounters')
@UseGuards(JwtAuthGuard)
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an encounter' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateEncounterDto) {
    return this.encountersService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List encounters for a campaign' })
  findAll(@Query() query: QueryEncountersDto, @Req() req: AuthenticatedRequest) {
    return this.encountersService.findAllForCampaign(query.campaignId, req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get encounter by ID' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.encountersService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update encounter' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateEncounterDto
  ) {
    return this.encountersService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete encounter' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.encountersService.remove(id, req.user.userId);
  }
}
