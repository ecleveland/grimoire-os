import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { SeedService } from './seed.service';
import { PrismaModule } from '../prisma/prisma.module';

// forRoot without the app-wide configuration, which throws when JWT_SECRET is
// unset. The seed reads only the database block, which PrismaModule loads, so
// the compose seed service runs without the backend's secrets.
@Module({
  imports: [ConfigModule.forRoot(), PrismaModule, CacheModule.register()],
  providers: [SeedService],
})
export class SeedModule {}
