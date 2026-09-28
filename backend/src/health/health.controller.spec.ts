import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok after the database answers SELECT 1', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('?').trim()).toBe('SELECT 1');
  });

  it('throws 503 when the database query fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = controller.check();
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.toThrow('Database unreachable');
  });
});
