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
import { SrdService } from './srd.service';
import { HomebrewSpellsService } from './homebrew-spells.service';
import { toActor } from './homebrew-write.helpers';
import { QuerySpellsDto } from './dto/query-spells.dto';
import { CreateSpellDto } from './dto/create-spell.dto';
import { UpdateSpellDto } from './dto/update-spell.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

/**
 * Spell reads + homebrew CRUD (VEG-294). Lives apart from {@link SrdController}
 * because these routes are deliberately NOT behind the URL-keyed CacheInterceptor:
 * responses vary per user (the caller's homebrew rides along with the catalog),
 * so a shared cache entry would leak one user's homebrew to another — and a
 * 24h TTL would hide a user's own writes from them.
 */
@ApiTags('SRD')
@Controller('srd/spells')
export class SpellsController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewSpells: HomebrewSpellsService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search spells (global catalog + the caller’s homebrew)' })
  searchSpells(@Query() query: QuerySpellsDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.searchSpells(query, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get spell by ID (resolves the caller’s homebrew too)' })
  findSpell(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findSpell(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew spell owned by the caller' })
  createSpell(@Body() dto: CreateSpellDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewSpells.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a spell (own homebrew; shared requires admin)' })
  updateSpell(
    @Param('id') id: string,
    @Body() dto: UpdateSpellDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewSpells.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a spell (own homebrew; shared requires admin)' })
  removeSpell(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewSpells.remove(id, toActor(req.user));
  }
}
