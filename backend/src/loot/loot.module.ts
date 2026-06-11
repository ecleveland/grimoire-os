import { Module } from '@nestjs/common';
import { MonsterLootService } from './monster-loot.service';

@Module({
  providers: [MonsterLootService],
  exports: [MonsterLootService],
})
export class LootModule {}
