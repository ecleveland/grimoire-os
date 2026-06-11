import { Module } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';
import { LootModule } from '../loot/loot.module';

@Module({
  imports: [CampaignAuthModule, LootModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
