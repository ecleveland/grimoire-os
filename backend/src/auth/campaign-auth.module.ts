import { Module } from '@nestjs/common';
import { CampaignAuthService } from './campaign-auth.service';

@Module({
  providers: [CampaignAuthService],
  exports: [CampaignAuthService],
})
export class CampaignAuthModule {}
