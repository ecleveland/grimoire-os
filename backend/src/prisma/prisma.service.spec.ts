import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from './prisma.service';

// Wraps the real adapter so the spec can read the pool options it was given
// while PrismaClient still receives a genuine adapter instance.
jest.mock('@prisma/adapter-pg', () => {
  const actual = jest.requireActual<typeof import('@prisma/adapter-pg')>('@prisma/adapter-pg');
  return {
    ...actual,
    PrismaPg: jest.fn((...args: ConstructorParameters<typeof actual.PrismaPg>) => {
      return new actual.PrismaPg(...args);
    }),
  };
});

describe('PrismaService', () => {
  let service: PrismaService;
  let config: { getOrThrow: jest.Mock };

  beforeEach(() => {
    config = { getOrThrow: jest.fn().mockReturnValue('postgresql://u:p@localhost:5432/db') };
    service = new PrismaService(config as unknown as ConfigService);
  });

  describe('constructor', () => {
    it('reads the connection string from database.url', () => {
      expect(config.getOrThrow).toHaveBeenCalledWith('database.url');
    });

    // Prisma 6's engine gave up on a connect after 5 s; pg waits forever by
    // default, which would leave /api/health hanging on a dead database.
    it('gives the pool a connect timeout and an idle timeout', () => {
      expect(PrismaPg).toHaveBeenCalledWith({
        connectionString: 'postgresql://u:p@localhost:5432/db',
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 10_000,
      });
    });

    it('fails fast when database.url is missing', () => {
      const missing = {
        getOrThrow: jest.fn(() => {
          throw new TypeError('Configuration key "database.url" does not exist');
        }),
      };

      expect(() => new PrismaService(missing as unknown as ConfigService)).toThrow('database.url');
    });
  });

  describe('onModuleInit', () => {
    it('calls $connect', async () => {
      const spy = jest.spyOn(service, '$connect').mockResolvedValue();

      await service.onModuleInit();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('calls $disconnect', async () => {
      const spy = jest.spyOn(service, '$disconnect').mockResolvedValue();

      await service.onModuleDestroy();

      expect(spy).toHaveBeenCalled();
    });
  });
});
