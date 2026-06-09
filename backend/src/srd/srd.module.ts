import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { HomebrewContentService } from './homebrew-content.service';

@Module({
  controllers: [SrdController],
  providers: [SrdService, PrintableCardsService, HomebrewContentService],
  exports: [SrdService, HomebrewContentService],
})
export class SrdModule {}
