import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { QueryFeaturesDto } from './dto/query-features.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';

/**
 * Cross-parent feature search (VEG-241), split out of {@link SrdController} by
 * VEG-507.
 *
 * A feature row carries no `contentSource` of its own — its tier is its
 * parent's — so scoping this search means joining back to a visible class,
 * subclass or background. That makes the response vary per caller, and
 * SrdController carries a blanket URL-keyed `CacheInterceptor` which would then
 * serve one user's homebrew features to the next caller of the same URL. Every
 * sibling tiered route was moved off it for exactly this reason.
 *
 * {@link AnonymousCacheInterceptor} is the tiered answer: anonymous responses
 * (the bare global catalog) are cached by URL, authenticated ones bypass the
 * cache entirely (VEG-333).
 *
 * Its own `srd/features` prefix rather than a second controller on `srd`: two
 * controllers sharing a prefix with opposite cache interceptors is a live
 * footgun, since a `@Get('features/…')` later added to SrdController would
 * compile, route, and land silently on the blanket cache (VEG-505).
 */
@ApiTags('SRD')
@Controller('srd/features')
@UseInterceptors(AnonymousCacheInterceptor)
export class FeaturesController {
  constructor(private readonly srdService: SrdService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Search class/subclass/race/background features',
    description:
      'Resolves the global catalog plus the caller’s own homebrew. A feature is ' +
      'visible exactly when its parent is, so features of another user’s ' +
      'homebrew class never appear.',
  })
  searchFeatures(@Query() query: QueryFeaturesDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.searchFeatures(query, req.user?.userId);
  }
}
