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
import { HomebrewItemsService } from './homebrew-items.service';
import { toActor } from './homebrew-write.helpers';
import { QueryItemsDto } from './dto/query-items.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

/**
 * Item reads + homebrew CRUD (VEG-296). Lives apart from {@link SrdController}
 * because responses vary per user — the caller's homebrew rides along with the
 * catalog — so they can't sit behind SrdController's blanket URL-keyed cache,
 * which would leak one user's homebrew to another and hide a user's own writes.
 * Instead it uses {@link AnonymousCacheInterceptor}: anonymous responses (the
 * bare global catalog) are cached by URL, authenticated ones bypass the cache
 * entirely (VEG-333).
 */
@ApiTags('SRD')
@Controller('srd/items')
@UseInterceptors(AnonymousCacheInterceptor)
export class ItemsController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewItems: HomebrewItemsService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search items (global catalog + the caller’s homebrew)' })
  searchItems(@Query() query: QueryItemsDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.searchItems(query, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get item by ID (resolves the caller’s homebrew too)' })
  findItem(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findItem(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew item owned by the caller' })
  createItem(@Body() dto: CreateItemDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewItems.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an item (own homebrew; shared requires admin)' })
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewItems.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an item (own homebrew; shared requires admin)' })
  removeItem(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewItems.remove(id, toActor(req.user));
  }
}
