import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CharactersModule } from './characters/characters.module';
import { NotesModule } from './notes/notes.module';
import { EncountersModule } from './encounters/encounters.module';
import { NpcsModule } from './npcs/npcs.module';
import { SrdModule } from './srd/srd.module';
import { AdminModule } from './admin/admin.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { WebsocketModule } from './websocket/websocket.module';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

// The module-level limit only matters when RateLimitGuard isn't applied (e.g.
// in tests that import ThrottlerModule directly). At runtime, RateLimitGuard
// swaps in per-request anon/authed limits, so this default is a safe ceiling.
const RUNTIME_DEFAULT_LIMIT = parseInt(process.env.THROTTLE_AUTHED_LIMIT ?? '120', 10);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
          limit: RUNTIME_DEFAULT_LIMIT,
        },
      ],
    }),
    // SRD data is static between seeds, so a 24h in-memory cache covers
    // realistic refresh windows. Cross-process invalidation isn't possible
    // with the default Map store; the TTL is the backstop. Swap in a Keyv
    // adapter (Redis, etc.) here if SRD reads ever fan out across replicas.
    CacheModule.register({
      isGlobal: true,
      ttl: 24 * 60 * 60 * 1000,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CampaignsModule,
    CharactersModule,
    NotesModule,
    EncountersModule,
    NpcsModule,
    SrdModule,
    AdminModule,
    AuditLogModule,
    WebsocketModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // RateLimitGuard runs before CsrfGuard so abusive clients trip a cheap 429
    // before we spend cycles validating CSRF tokens.
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
