import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';
import { PrintableCardsService } from './printable-cards.service';

@Module({
  controllers: [SrdController],
  providers: [SrdService, PrintableCardsService],
  exports: [SrdService],
})
export class SrdModule {}
