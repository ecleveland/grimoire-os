import { Module } from '@nestjs/common';
import { SrdController } from './srd.controller';
import { SrdService } from './srd.service';

@Module({
  controllers: [SrdController],
  providers: [SrdService],
  exports: [SrdService],
})
export class SrdModule {}
