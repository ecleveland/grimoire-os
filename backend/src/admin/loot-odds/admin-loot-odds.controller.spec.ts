import { Test, TestingModule } from '@nestjs/testing';
import { AdminLootOddsController } from './admin-loot-odds.controller';
import { AdminLootOddsService } from './admin-loot-odds.service';

describe('AdminLootOddsController', () => {
  let controller: AdminLootOddsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      get: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminLootOddsController],
      providers: [{ provide: AdminLootOddsService, useValue: service }],
    }).compile();

    controller = module.get<AdminLootOddsController>(AdminLootOddsController);
  });

  it('get delegates to the service', async () => {
    const rules = { trinketChance: 0.05 };
    service.get.mockResolvedValue(rules);
    expect(await controller.get()).toBe(rules);
    expect(service.get).toHaveBeenCalledWith();
  });

  it('update forwards the validated body', async () => {
    const body = { coinageMultiplier: 2 };
    service.update.mockResolvedValue({});
    await controller.update(body);
    expect(service.update).toHaveBeenCalledWith(body);
  });
});
