import { Test, TestingModule } from '@nestjs/testing';
import { AdminItemsController } from './admin-items.controller';
import { AdminItemsService } from './admin-items.service';
import { USER_ID } from '../../test/fixtures';

const req = { user: { userId: USER_ID, username: 'admin', role: 'admin' } } as never;
const expectedActor = { userId: USER_ID, isAdmin: true };

describe('AdminItemsController', () => {
  let controller: AdminItemsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      setBundleContents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminItemsController],
      providers: [{ provide: AdminItemsService, useValue: service }],
    }).compile();

    controller = module.get<AdminItemsController>(AdminItemsController);
  });

  it('list forwards the query fields', async () => {
    service.list.mockResolvedValue({ data: [] });
    await controller.list({ q: 'silk', category: 'Trade Goods', page: 2, limit: 10 } as never);
    expect(service.list).toHaveBeenCalledWith({
      q: 'silk',
      category: 'Trade Goods',
      page: 2,
      limit: 10,
    });
  });

  it('create maps the JWT user to a content actor', async () => {
    service.create.mockResolvedValue({ id: 'i1' });
    const dto = { name: "Explorer's Pack", category: 'Equipment Pack' } as never;
    await controller.create(dto, req);
    expect(service.create).toHaveBeenCalledWith(dto, expectedActor);
  });

  it('update delegates with id, dto and actor', async () => {
    service.update.mockResolvedValue({ id: 'i1' });
    await controller.update('i1', { name: 'X' } as never, req);
    expect(service.update).toHaveBeenCalledWith('i1', { name: 'X' }, expectedActor);
  });

  it('remove delegates and returns void', async () => {
    service.remove.mockResolvedValue(undefined);
    const result = await controller.remove('i1', req);
    expect(service.remove).toHaveBeenCalledWith('i1', expectedActor);
    expect(result).toBeUndefined();
  });

  it('setContents forwards the contents array and actor', async () => {
    service.setBundleContents.mockResolvedValue({ id: 'pack-1', contents: [] });
    const dto = { contents: [{ itemId: 'c1', quantity: 2 }] } as never;
    await controller.setContents('pack-1', dto, req);
    expect(service.setBundleContents).toHaveBeenCalledWith(
      'pack-1',
      [{ itemId: 'c1', quantity: 2 }],
      expectedActor
    );
  });
});
