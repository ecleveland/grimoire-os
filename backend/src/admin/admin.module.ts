import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminNpcDataController } from './npc-data/admin-npc-data.controller';
import { AdminNpcDataService } from './npc-data/admin-npc-data.service';
import { AdminLootOddsController } from './loot-odds/admin-loot-odds.controller';
import { AdminLootOddsService } from './loot-odds/admin-loot-odds.service';
import { AdminItemsController } from './items/admin-items.controller';
import { AdminItemsService } from './items/admin-items.service';
import { ContentAccessService } from '../srd/content-access.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [UsersModule, PrismaModule],
  controllers: [
    AdminController,
    AdminNpcDataController,
    AdminLootOddsController,
    AdminItemsController,
  ],
  providers: [AdminNpcDataService, AdminLootOddsService, AdminItemsService, ContentAccessService],
})
export class AdminModule {}
