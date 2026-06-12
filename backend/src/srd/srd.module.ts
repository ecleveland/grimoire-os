import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { MonstersController } from './monsters.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { ContentAccessService } from './content-access.service';
import { HomebrewMonstersService } from './homebrew-monsters.service';

@Module({
  controllers: [SrdController, MonstersController],
  providers: [SrdService, PrintableCardsService, ContentAccessService, HomebrewMonstersService],
  exports: [SrdService, ContentAccessService],
})
export class SrdModule {}
