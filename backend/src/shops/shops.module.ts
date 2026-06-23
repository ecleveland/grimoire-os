import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopThemeService } from './shop-theme.service';
import { ShopPurchaseService } from './shop-purchase.service';
import { CampaignAuthModule } from '../auth/campaign-auth.module';

@Module({
  imports: [CampaignAuthModule],
  controllers: [ShopsController],
  providers: [ShopsService, ShopThemeService, ShopPurchaseService],
  exports: [ShopsService],
})
export class ShopsModule {}
