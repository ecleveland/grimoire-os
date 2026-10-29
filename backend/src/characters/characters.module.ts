import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { ContentAccessService } from '../srd/content-access.service';
import { CharacterSnapshotsController } from './snapshots/character-snapshots.controller';
import { CharacterSnapshotsService } from './snapshots/character-snapshots.service';

@Module({
  imports: [CampaignAuthModule],
  controllers: [CharactersController, CharacterSnapshotsController],
  providers: [
    CharactersService,
    CharacterSnapshotsService,
    InventoryResolverService,
    ContentAccessService,
  ],
  exports: [CharactersService],
})
export class CharactersModule {}
