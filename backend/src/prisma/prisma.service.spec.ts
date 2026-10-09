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
  let config: { getOrThrow: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    jest.mocked(PrismaPg).mockClear();
    config = {
      getOrThrow: jest.fn().mockReturnValue('postgresql://u:p@localhost:5432/db'),
      get: jest.fn().mockReturnValue(undefined),
    };
    service = new PrismaService(config as unknown as ConfigService);
  });

  describe('constructor', () => {
    it('reads the connection string from database.url', () => {
      expect(config.getOrThrow).toHaveBeenCalledWith('database.url');
    });

    // Prisma 6's engine gave up on a connect after 5 s; pg waits forever by
    // default, which would leave /api/health hanging on a dead database.
    it('gives the pool a connect timeout', () => {
      expect(PrismaPg).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://u:p@localhost:5432/db',
          connectionTimeoutMillis: 5_000,
        })
      );
    });

    it('passes the database ssl setting through to the adapter', () => {
      jest.mocked(PrismaPg).mockClear();
      config.get.mockReturnValue({ rejectUnauthorized: false });

      new PrismaService(config as unknown as ConfigService);

      expect(config.get).toHaveBeenCalledWith('database.ssl');
      expect(PrismaPg).toHaveBeenCalledWith(
        expect.objectContaining({ ssl: { rejectUnauthorized: false } })
      );
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
      jest.spyOn(service, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as never);

      await service.onModuleInit();

      expect(spy).toHaveBeenCalled();
    });

    // $connect only builds the pg pool, so the probe is what proves the
    // database answers before the app starts taking requests.
    it('probes the database with a query after connecting', async () => {
      jest.spyOn(service, '$connect').mockResolvedValue();
      const probe = jest
        .spyOn(service, '$queryRaw')
        .mockResolvedValue([{ '?column?': 1 }] as never);

      await service.onModuleInit();

      expect(probe).toHaveBeenCalledTimes(1);
      const [strings] = probe.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(strings.join('')).toBe('SELECT 1');
    });

    it('rejects when the database does not answer the probe', async () => {
      jest.spyOn(service, '$connect').mockResolvedValue();
      jest.spyOn(service, '$queryRaw').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.onModuleInit()).rejects.toThrow('ECONNREFUSED');
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
