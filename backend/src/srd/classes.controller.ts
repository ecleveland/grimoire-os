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
import { HomebrewClassesService } from './homebrew-classes.service';
import { toActor } from './homebrew-write.helpers';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/interfaces/jwt-payload.interface';

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
 * Homebrew class CRUD (VEG-506) is the write half below. The split was put in
 * place by VEG-505 first, precisely so these routes could land without the leak.
 */
@ApiTags('SRD')
@Controller('srd/classes')
@UseInterceptors(AnonymousCacheInterceptor)
export class ClassesController {
  constructor(
    private readonly srdService: SrdService,
    private readonly homebrewClasses: HomebrewClassesService
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List classes (global catalog + the caller’s homebrew)' })
  findAllClasses(@Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findAllClasses(req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get class by ID (includes subclasses)' })
  findClass(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findClass(id, req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a homebrew class owned by the caller' })
  createClass(@Body() dto: CreateClassDto, @Req() req: AuthenticatedRequest) {
    return this.homebrewClasses.create(dto, toActor(req.user));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a class (own homebrew; shared requires admin)' })
  updateClass(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.homebrewClasses.update(id, dto, toActor(req.user));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a class (own homebrew; shared requires admin)',
    description: 'Refused with 409 while any subclass still points at the class.',
  })
  removeClass(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.homebrewClasses.remove(id, toActor(req.user));
  }
}

/**
 * Split from {@link ClassesController} rather than sharing an `srd` prefix
 * (VEG-505). Two controllers on the same prefix with opposite cache
 * interceptors is a live footgun: a `@Get('classes/…')` later added to
 * SrdController would compile, route, and land silently on the blanket
 * URL-keyed cache. Entity-specific prefixes make that impossible, and match
 * every sibling tiered controller.
 */
@ApiTags('SRD')
@Controller('srd/subclasses')
@UseInterceptors(AnonymousCacheInterceptor)
export class SubclassesController {
  constructor(private readonly srdService: SrdService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List subclasses (global catalog + the caller’s homebrew)' })
  searchSubclasses(@Req() req: OptionallyAuthenticatedRequest, @Query('classId') classId?: string) {
    return this.srdService.searchSubclasses(classId, req.user?.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get subclass by ID' })
  findSubclass(@Param('id') id: string, @Req() req: OptionallyAuthenticatedRequest) {
    return this.srdService.findSubclass(id, req.user?.userId);
  }
}
