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
import { HomebrewFeatsService } from './homebrew-feats.service';
import { toActor } from './homebrew-write.helpers';
import { QueryFeatsDto } from './dto/query-feats.dto';
import { CreateFeatDto } from './dto/create-feat.dto';
import { UpdateFeatDto } from './dto/update-feat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

/**
 * Feat reads + homebrew CRUD (VEG-295). Lives apart from {@link SrdController}
 * because responses vary per user — the caller's homebrew rides along with the
 * catalog — so they can't sit behind SrdController's blanket URL-keyed cache,
 * which would leak one user's homebrew to another and hide a user's own writes.
 * Instead it uses {@link AnonymousCacheInterceptor}: anonymous responses (the
 * bare global catalog) are cached by URL, authenticated ones bypass the cache
 * entirely (VEG-333).
 */
@ApiTags('SRD')
@Controller('srd/feats')
@UseInterceptors(AnonymousCacheInterceptor)
export class FeatsController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewFeats: HomebrewFeatsService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search feats (global catalog + the caller’s homebrew)' })
  searchFeats(@Query() query: QueryFeatsDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.searchFeats(query, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get feat by ID (resolves the caller’s homebrew too)' })
  findFeat(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findFeat(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew feat owned by the caller' })
  createFeat(@Body() dto: CreateFeatDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewFeats.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a feat (own homebrew; shared requires admin)' })
  updateFeat(
    @Param('id') id: string,
    @Body() dto: UpdateFeatDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewFeats.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a feat (own homebrew; shared requires admin)' })
  removeFeat(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewFeats.remove(id, toActor(req.user));
  }
}
