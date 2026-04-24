import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
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
