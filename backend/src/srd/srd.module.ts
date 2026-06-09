import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';
import { ContentAccessService } from './content-access.service';

@Module({
  controllers: [SrdController],
  providers: [SrdService, PrintableCardsService, ContentAccessService],
  exports: [SrdService, ContentAccessService],
})
export class SrdModule {}
