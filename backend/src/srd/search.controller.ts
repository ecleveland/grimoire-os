import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SrdService } from './srd.service';
import { QuerySearchDto } from './dto/query-search.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';

/**
 * Unified search across spells, feats, and features (VEG-294). Lives apart
 * from {@link SrdController} because the response varies per user — the
 * caller's homebrew spells and feats ride along with the catalog — so it must
 * stay off that controller's URL-keyed CacheInterceptor, which would leak one
 * user's homebrew to another.
 */
@ApiTags('SRD')
@Controller('srd')
export class SearchController {
  constructor(private readonly srdService: SrdService) {}

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Unified search across spells, feats, and features (incl. the caller’s homebrew)',
  })
  search(@Query() query: QuerySearchDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.search(query, req.user?.userId);
  }
}
