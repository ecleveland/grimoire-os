import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SrdService } from './srd.service';

@ApiTags('SRD')
@Controller('srd')
export class SrdController {
  constructor(private readonly srdService: SrdService) {}

  @Get('spells')
  @ApiOperation({ summary: 'Search SRD spells' })
  searchSpells(
    @Query('q') query?: string,
    @Query('class') classFilter?: string,
    @Query('level') level?: number,
  ) {
    return this.srdService.searchSpells(query, classFilter, level);
  }

  @Get('spells/:id')
  @ApiOperation({ summary: 'Get spell by ID' })
  findSpell(@Param('id') id: string) {
    return this.srdService.findSpell(id);
  }

  @Get('monsters')
  @ApiOperation({ summary: 'Search SRD monsters' })
  searchMonsters(
    @Query('q') query?: string,
    @Query('type') type?: string,
    @Query('cr') cr?: string,
  ) {
    return this.srdService.searchMonsters(query, type, cr);
  }

  @Get('monsters/:id')
  @ApiOperation({ summary: 'Get monster by ID' })
  findMonster(@Param('id') id: string) {
    return this.srdService.findMonster(id);
  }

  @Get('items')
  @ApiOperation({ summary: 'Search SRD items' })
  searchItems(
    @Query('q') query?: string,
    @Query('category') category?: string,
  ) {
    return this.srdService.searchItems(query, category);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get item by ID' })
  findItem(@Param('id') id: string) {
    return this.srdService.findItem(id);
  }

  @Get('classes')
  @ApiOperation({ summary: 'List all SRD classes' })
  findAllClasses() {
    return this.srdService.findAllClasses();
  }

  @Get('classes/:id')
  @ApiOperation({ summary: 'Get class by ID' })
  findClass(@Param('id') id: string) {
    return this.srdService.findClass(id);
  }

  @Get('races')
  @ApiOperation({ summary: 'List all SRD races' })
  findAllRaces() {
    return this.srdService.findAllRaces();
  }

  @Get('races/:id')
  @ApiOperation({ summary: 'Get race by ID' })
  findRace(@Param('id') id: string) {
    return this.srdService.findRace(id);
  }
}
