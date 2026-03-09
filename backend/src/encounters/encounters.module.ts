import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { Encounter, EncounterSchema } from './schemas/encounter.schema';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Encounter.name, schema: EncounterSchema }]),
    CampaignsModule,
  ],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
