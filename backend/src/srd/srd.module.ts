import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { MonstersController } from './monsters.controller';
import { SpellsController } from './spells.controller';
import { FeatsController } from './feats.controller';
import { BackgroundsController } from './backgrounds.controller';
import { ItemsController } from './items.controller';
import { SearchController } from './search.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { ContentAccessService } from './content-access.service';
import { HomebrewMonstersService } from './homebrew-monsters.service';
import { HomebrewSpellsService } from './homebrew-spells.service';
import { HomebrewFeatsService } from './homebrew-feats.service';
import { HomebrewBackgroundsService } from './homebrew-backgrounds.service';
import { HomebrewItemsService } from './homebrew-items.service';

@Module({
  controllers: [
    SrdController,
    MonstersController,
    SpellsController,
    FeatsController,
    BackgroundsController,
    ItemsController,
    SearchController,
  ],
  providers: [
    SrdService,
    PrintableCardsService,
    ContentAccessService,
    HomebrewMonstersService,
    HomebrewSpellsService,
    HomebrewFeatsService,
    HomebrewBackgroundsService,
    HomebrewItemsService,
  ],
  exports: [SrdService, ContentAccessService],
})
export class SrdModule {}
