import { Controller, Get, Param, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SrdService } from './srd.service';
import { AnonymousCacheInterceptor } from './anonymous-cache.interceptor';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';

/**
 * Class and subclass reads (VEG-505). Split out of {@link SrdController} for
 * the same reason the monster/spell/feat/item/background controllers were:
 * once a row can be homebrew the response varies per caller, and SrdController
 * carries a blanket URL-keyed `CacheInterceptor` that would serve one user's
 * homebrew to the next caller of the same URL and hide a user's own writes.
 *
 * {@link AnonymousCacheInterceptor} is the tiered-content answer: anonymous
 * responses (the bare global catalog) are cached by URL, authenticated ones
 * bypass the cache entirely (VEG-333).
 *
 * Homebrew class CRUD lands here in VEG-506. Until then these are reads only,
 * and with no homebrew rows in existence every caller sees the same catalog —
 * the split is in place first so VEG-506 cannot ship the leak.
 */
@ApiTags('SRD')
@Controller('srd')
@UseInterceptors(AnonymousCacheInterceptor)
export class ClassesController {
  constructor(private readonly srdService: SrdService) {}

  @Get('classes')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List classes (global catalog + the caller’s homebrew)' })
  findAllClasses(@Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findAllClasses(req.user?.userId);
  }

  @Get('classes/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get class by ID (includes subclasses)' })
  findClass(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findClass(id, req.user?.userId);
  }

  @Get('subclasses')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List subclasses (global catalog + the caller’s homebrew)' })
  searchSubclasses(@Req() req: OptionallyAuthenticatedRequest, @Query('classId') classId?: string) {
    return this.srdService.searchSubclasses(classId, req.user?.userId);
  }

  @Get('subclasses/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get subclass by ID' })
  findSubclass(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findSubclass(id, req.user?.userId);
  }
}
