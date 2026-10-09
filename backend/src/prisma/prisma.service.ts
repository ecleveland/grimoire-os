import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { DatabaseSsl } from '../config/database.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('database.url'),
        // sslmode translated to Prisma 6 semantics; see database.config.ts.
        ssl: config.get<DatabaseSsl>('database.ssl'),
        // pg waits forever by default, both to open a connection and for a free
        // one from the pool, so a dead database would hang /api/health instead
        // of answering 503. 5 s matches Prisma 6's connect_timeout. The pool
        // size is pg's default of 10.
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
    // With the driver adapter, $connect only builds the pool and succeeds with
    // the database down. The probe makes startup fail instead, as Prisma 6 did.
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
