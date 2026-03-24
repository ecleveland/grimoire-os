import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SrdService } from './srd.service';

@ApiTags('SRD')
@Controller('srd')
export class SrdController {
  constructor(private readonly srdService: SrdService) {}

  // ── Spells ──────────────────────────────────────────

  @Get('spells')
  @ApiOperation({ summary: 'Search SRD spells' })
  searchSpells(
    @Query('q') query?: string,
    @Query('class') classFilter?: string,
    @Query('level') level?: number,
    @Query('school') school?: string
  ) {
    return this.srdService.searchSpells(query, classFilter, level, school);
  }

  @Get('spells/:id')
  @ApiOperation({ summary: 'Get spell by ID' })
  findSpell(@Param('id') id: string) {
    return this.srdService.findSpell(id);
  }

  // ── Monsters ────────────────────────────────────────

  @Get('monsters')
  @ApiOperation({ summary: 'Search SRD monsters' })
  searchMonsters(
    @Query('q') query?: string,
    @Query('type') type?: string,
    @Query('cr') cr?: string,
    @Query('size') size?: string,
    @Query('minCr') minCr?: string,
    @Query('maxCr') maxCr?: string
  ) {
    return this.srdService.searchMonsters(query, type, cr, size, minCr, maxCr);
  }

  @Get('monsters/:id')
  @ApiOperation({ summary: 'Get monster by ID' })
  findMonster(@Param('id') id: string) {
    return this.srdService.findMonster(id);
  }

  // ── Items ───────────────────────────────────────────

  @Get('items')
  @ApiOperation({ summary: 'Search SRD items' })
  searchItems(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('rarity') rarity?: string,
    @Query('isMagic') isMagic?: string
  ) {
    return this.srdService.searchItems(query, category, rarity, isMagic);
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
}
