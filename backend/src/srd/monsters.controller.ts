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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { toActor } from './homebrew-write.helpers';
import { QueryMonstersDto } from './dto/query-monsters.dto';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { UpdateMonsterDto } from './dto/update-monster.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

/**
 * Monster reads + homebrew CRUD (VEG-293). Lives apart from {@link SrdController}
 * because responses vary per user — the caller's homebrew rides along with the
 * catalog — so they can't sit behind SrdController's blanket URL-keyed cache,
 * which would leak one user's homebrew to another and hide a user's own writes.
 * Instead it uses {@link AnonymousCacheInterceptor}: anonymous responses (the
 * bare global catalog) are cached by URL, authenticated ones bypass the cache
 * entirely (VEG-333).
 */
@ApiTags('SRD')
@Controller('srd/monsters')
@UseInterceptors(AnonymousCacheInterceptor)
export class MonstersController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewMonsters: HomebrewMonstersService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search monsters (global catalog + the caller’s homebrew)' })
  searchMonsters(@Query() query: QueryMonstersDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.searchMonsters(query, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get monster by ID (resolves the caller’s homebrew too)' })
  findMonster(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findMonster(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew monster owned by the caller' })
  createMonster(@Body() dto: CreateMonsterDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewMonsters.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a monster (own homebrew; shared requires admin)' })
  updateMonster(
    @Param('id') id: string,
    @Body() dto: UpdateMonsterDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewMonsters.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a monster (own homebrew; shared requires admin)' })
  removeMonster(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewMonsters.remove(id, toActor(req.user));
  }
}
