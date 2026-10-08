import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from '../config/database.config';
import { PrismaService } from './prisma.service';

// The database block only, so the module boots on its own (the NPC backfill
// script) without the app-wide configuration and its JWT_SECRET requirement.
@Global()
@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
