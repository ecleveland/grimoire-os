import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { SeedService } from './seed.service';
import { PrismaModule } from '../prisma/prisma.module';
import configuration from '../config/configuration';

@Module({
  imports: [ConfigModule.forRoot({ load: [configuration] }), PrismaModule, CacheModule.register()],
  providers: [SeedService],
})
export class SeedModule {}
