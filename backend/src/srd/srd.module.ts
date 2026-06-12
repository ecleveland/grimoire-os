import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { MonstersController } from './monsters.controller';
import { SpellsController } from './spells.controller';
import { SearchController } from './search.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { ContentAccessService } from './content-access.service';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { HomebrewSpellsService } from './homebrew-spells.service';

@Module({
  controllers: [SrdController, MonstersController, SpellsController, SearchController],
  providers: [
    SrdService,
    PrintableCardsService,
    ContentAccessService,
    HomebrewMonstersService,
    HomebrewSpellsService,
  ],
  exports: [SrdService, ContentAccessService],
})
export class SrdModule {}
