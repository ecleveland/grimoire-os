import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { QuerySpellsDto } from './dto/query-spells.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { QueryFeaturesDto } from './dto/query-features.dto';
import { QuerySearchDto } from './dto/query-search.dto';
import { HydratePrintCardsDto } from './dto/hydrate-cards.dto';

@ApiTags('SRD')
@Controller('srd')
@UseInterceptors(CacheInterceptor)
export class SrdController {
  constructor(
    private readonly srdService: SrdService,
    private readonly printableCardsService: PrintableCardsService
  ) {}

  // ── Spells ──────────────────────────────────────────

  @Get('spells')
  @ApiOperation({ summary: 'Search SRD spells' })
  searchSpells(@Query() query: QuerySpellsDto) {
    return this.srdService.searchSpells(query);
  }

  @Get('spells/:id')
  @ApiOperation({ summary: 'Get spell by ID' })
  findSpell(@Param('id') id: string) {
    return this.srdService.findSpell(id);
  }

  // Monster routes live in MonstersController: their responses vary per user
  // (caller's homebrew included, VEG-293), so they must stay off this
  // controller's URL-keyed CacheInterceptor.

  // ── Items ───────────────────────────────────────────

  @Get('items')
  @ApiOperation({ summary: 'Search SRD items' })
  searchItems(@Query() query: QueryItemsDto) {
    return this.srdService.searchItems(query);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get item by ID' })
  findItem(@Param('id') id: string) {
    return this.srdService.findItem(id);
  }

  // ── Classes ─────────────────────────────────────────

  @Get('classes')
  @ApiOperation({ summary: 'List all SRD classes' })
  findAllClasses() {
    return this.srdService.findAllClasses();
  }

  @Get('classes/:id')
  @ApiOperation({ summary: 'Get class by ID (includes subclasses)' })
  findClass(@Param('id') id: string) {
    return this.srdService.findClass(id);
  }

  // ── Races ───────────────────────────────────────────

  @Get('races')
  @ApiOperation({ summary: 'List all SRD races' })
  findAllRaces() {
    return this.srdService.findAllRaces();
  }

  @Get('races/:id')
  @ApiOperation({ summary: 'Get race by ID (includes subraces)' })
  findRace(@Param('id') id: string) {
    return this.srdService.findRace(id);
  }

  // ── Subclasses ──────────────────────────────────────

  @Get('subclasses')
  @ApiOperation({ summary: 'List SRD subclasses' })
  searchSubclasses(@Query('classId') classId?: string) {
    return this.srdService.searchSubclasses(classId);
  }

  @Get('subclasses/:id')
  @ApiOperation({ summary: 'Get subclass by ID' })
  findSubclass(@Param('id') id: string) {
    return this.srdService.findSubclass(id);
  }

  // ── Subraces ────────────────────────────────────────

  @Get('subraces')
  @ApiOperation({ summary: 'List SRD subraces' })
  searchSubraces(@Query('raceId') raceId?: string) {
    return this.srdService.searchSubraces(raceId);
  }

  @Get('subraces/:id')
  @ApiOperation({ summary: 'Get subrace by ID' })
  findSubrace(@Param('id') id: string) {
    return this.srdService.findSubrace(id);
  }

  // ── Backgrounds ─────────────────────────────────────

  @Get('backgrounds')
  @ApiOperation({ summary: 'List SRD backgrounds' })
  searchBackgrounds(@Query('q') query?: string) {
    return this.srdService.searchBackgrounds(query);
  }

  @Get('backgrounds/:id')
  @ApiOperation({ summary: 'Get background by ID' })
  findBackground(@Param('id') id: string) {
    return this.srdService.findBackground(id);
  }

  // ── Feats ───────────────────────────────────────────

  @Get('feats')
  @ApiOperation({ summary: 'List SRD feats' })
  searchFeats(@Query('q') query?: string) {
    return this.srdService.searchFeats(query);
  }

  @Get('feats/:id')
  @ApiOperation({ summary: 'Get feat by ID' })
  findFeat(@Param('id') id: string) {
    return this.srdService.findFeat(id);
  }

  // ── Conditions ──────────────────────────────────────

  @Get('conditions')
  @ApiOperation({ summary: 'List all SRD conditions' })
  findAllConditions() {
    return this.srdService.findAllConditions();
  }

  @Get('conditions/:id')
  @ApiOperation({ summary: 'Get condition by ID' })
  findCondition(@Param('id') id: string) {
    return this.srdService.findCondition(id);
  }

  // ── Skills ──────────────────────────────────────────

  @Get('skills')
  @ApiOperation({ summary: 'List SRD skills' })
  searchSkills(@Query('ability') ability?: string) {
    return this.srdService.searchSkills(ability);
  }

  @Get('skills/:id')
  @ApiOperation({ summary: 'Get skill by ID' })
  findSkill(@Param('id') id: string) {
    return this.srdService.findSkill(id);
  }

  // ── Languages ───────────────────────────────────────

  @Get('languages')
  @ApiOperation({ summary: 'List SRD languages' })
  searchLanguages(@Query('type') type?: string) {
    return this.srdService.searchLanguages(type);
  }

  @Get('languages/:id')
  @ApiOperation({ summary: 'Get language by ID' })
  findLanguage(@Param('id') id: string) {
    return this.srdService.findLanguage(id);
  }

  // ── Game Rules ─────────────────────────────────────

  @Get('rules')
  @ApiOperation({ summary: 'List all game rules' })
  findAllRules() {
    return this.srdService.findAllRules();
  }

  @Get('rules/:category')
  @ApiOperation({ summary: 'Get game rules by category' })
  findRulesByCategory(@Param('category') category: string) {
    return this.srdService.findRulesByCategory(category);
  }

  // ── Features (cross-parent search) ──────────────────

  @Get('features')
  @ApiOperation({
    summary: 'Search class/subclass/race/background features',
  })
  searchFeatures(@Query() query: QueryFeaturesDto) {
    return this.srdService.searchFeatures(query);
  }

  // ── Unified search (spells + feats + features) ──────

  @Get('search')
  @ApiOperation({
    summary: 'Unified search across spells, feats, and features',
  })
  search(@Query() query: QuerySearchDto) {
    return this.srdService.search(query);
  }

  // ── Printable cards batch hydrate (VEG-263) ─────────

  // Per-user response (the caller's homebrew hydrates too, VEG-331) — safe
  // under this controller's URL-keyed CacheInterceptor only because Nest never
  // caches non-GET requests. Keep it a POST.
  @Post('cards')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Batch-hydrate a mixed print selection into printable card view-models',
    description:
      'Read-only despite POST (the grouped selection exceeds query-string limits). ' +
      'Resolves the global catalog plus the caller’s own homebrew. ' +
      'Unknown ids are silently dropped; batches above 100 total ids are rejected.',
  })
  hydrateCards(@Body() body: HydratePrintCardsDto, @Req() req: OptionallyAuthenticatedRequest) {
    return this.printableCardsService.hydrate(body.selections, req.user?.userId);
  }
}
