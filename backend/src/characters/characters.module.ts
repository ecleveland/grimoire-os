import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';
import { InventoryResolverService } from './inventory/inventory-resolver.service';
import { ContentAccessService } from '../srd/content-access.service';

@Module({
  imports: [CampaignAuthModule],
  controllers: [CharactersController],
  providers: [CharactersService, InventoryResolverService, ContentAccessService],
  exports: [CharactersService],
})
export class CharactersModule {}
