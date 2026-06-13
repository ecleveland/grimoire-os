import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminNpcDataController } from './npc-data/admin-npc-data.controller';
import { AdminNpcDataService } from './npc-data/admin-npc-data.service';
import { AdminLootOddsController } from './loot-odds/admin-loot-odds.controller';
import { AdminLootOddsService } from './loot-odds/admin-loot-odds.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [UsersModule, PrismaModule],
  controllers: [AdminController, AdminNpcDataController, AdminLootOddsController],
  providers: [AdminNpcDataService, AdminLootOddsService],
})
export class AdminModule {}
