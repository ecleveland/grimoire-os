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
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import { toActor } from './homebrew-write.helpers';
import { QueryBackgroundsDto } from './dto/query-backgrounds.dto';
import { CreateBackgroundDto } from './dto/create-background.dto';
import { UpdateBackgroundDto } from './dto/update-background.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

/**
 * Background reads + homebrew CRUD (VEG-431). Lives apart from
 * {@link SrdController} because responses vary per user — the caller's homebrew
 * rides along with the catalog — so they can't sit behind SrdController's
 * blanket URL-keyed cache, which would leak one user's homebrew to another and
 * hide a user's own writes. Instead it uses {@link AnonymousCacheInterceptor}:
 * anonymous responses (the bare global catalog) are cached by URL,
 * authenticated ones bypass the cache entirely (VEG-333).
 *
 * Unlike feats, the list deliberately stays a bare (unpaginated) array — see
 * {@link QueryBackgroundsDto}.
 */
@ApiTags('SRD')
@Controller('srd/backgrounds')
@UseInterceptors(AnonymousCacheInterceptor)
export class BackgroundsController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewBackgrounds: HomebrewBackgroundsService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List backgrounds (global catalog + the caller’s homebrew)' })
  searchBackgrounds(
    @Query() query: QueryBackgroundsDto,
    @Req() req: OptionallyAuthenticatedRequest
  ) {
    return this.srdService.searchBackgrounds(query.q, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get background by ID (resolves the caller’s homebrew too)' })
  findBackground(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findBackground(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew background owned by the caller' })
  createBackground(@Body() dto: CreateBackgroundDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewBackgrounds.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a background (own homebrew; shared requires admin)' })
  updateBackground(
    @Param('id') id: string,
    @Body() dto: UpdateBackgroundDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewBackgrounds.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a background (own homebrew; shared requires admin)' })
  removeBackground(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewBackgrounds.remove(id, toActor(req.user));
  }
}
