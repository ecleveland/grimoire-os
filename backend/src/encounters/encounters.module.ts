import { Module } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';
import { LootModule } from '../loot/loot.module';
import { SrdModule } from '../srd/srd.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [CampaignAuthModule, LootModule, SrdModule, CharactersModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
