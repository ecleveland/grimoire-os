import { Module } from '@nestjs/common';
import { NpcsController } from './npcs.controller';
import { NpcsService } from './npcs.service';
import { NpcGeneratorService } from './generator/npc-generator.service';
import { NpcRefDataLoader } from './generator/npc-ref-data.loader';
import { CampaignAuthModule } from '../auth/campaign-auth.module';

@Module({
  imports: [CampaignAuthModule],
  controllers: [NpcsController],
  providers: [NpcsService, NpcGeneratorService, NpcRefDataLoader],
  exports: [NpcsService, NpcGeneratorService],
})
export class NpcsModule {}
