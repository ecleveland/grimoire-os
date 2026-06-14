import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { QuerySearchDto } from './dto/query-search.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';

/**
 * Unified search across spells, feats, items, and features (VEG-294). Lives
 * apart from {@link SrdController} because the response varies per user — the
 * caller's homebrew spells, feats, and items ride along with the catalog — so
 * it must stay off that controller's blanket URL-keyed cache, which would leak
 * one user's homebrew to another. Instead it uses {@link AnonymousCacheInterceptor}:
 * anonymous responses (the bare global catalog) are cached by URL — this is the
 * highest-traffic public surface and the worst case to recompute (UNION ALL id +
 * count queries) — while authenticated ones bypass the cache entirely (VEG-333).
 */
@ApiTags('SRD')
@Controller('srd')
@UseInterceptors(AnonymousCacheInterceptor)
export class SearchController {
  constructor(private readonly srdService: SrdService) {}

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Unified search across spells, feats, items, and features (incl. the caller’s homebrew)',
  })
  search(@Query() query: QuerySearchDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.search(query, req.user?.userId);
  }
}
