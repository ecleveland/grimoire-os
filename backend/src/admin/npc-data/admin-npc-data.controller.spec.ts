import { Test, TestingModule } from '@nestjs/testing';
import { AdminNpcDataController } from './admin-npc-data.controller';
import { AdminNpcDataService } from './admin-npc-data.service';
import { USER_ID } from '../../test/fixtures';

describe('AdminNpcDataController', () => {
  let controller: AdminNpcDataController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      setActive: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNpcDataController],
      providers: [{ provide: AdminNpcDataService, useValue: service }],
    }).compile();

    controller = module.get<AdminNpcDataController>(AdminNpcDataController);
  });

  it('list delegates with table', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('names');
    expect(service.list).toHaveBeenCalledWith('names');
  });

  it('create passes the JWT userId from req.user', async () => {
    service.create.mockResolvedValue({ id: 'n1' });
    const req = { user: { userId: USER_ID, username: 'admin', role: 'admin' } } as never;
    await controller.create('names', { race: 'Elf', kind: 'first', value: 'Arannis' }, req);
    expect(service.create).toHaveBeenCalledWith(
      'names',
      USER_ID,
      expect.objectContaining({ value: 'Arannis' })
    );
  });

  it('create forwards the authenticated admin id for personality rows', async () => {
    service.create.mockResolvedValue({ id: 'p1', addedById: USER_ID });
    const req = { user: { userId: USER_ID, username: 'admin', role: 'admin' } } as never;
    await controller.create(
      'personality',
      { background: 'Acolyte', kind: 'ideals', value: 'Faith above all.' },
      req
    );
    expect(service.create).toHaveBeenCalledWith(
      'personality',
      USER_ID,
      expect.objectContaining({ background: 'Acolyte' })
    );
  });

  it('setActive forwards isActive value', async () => {
    service.setActive.mockResolvedValue({ id: 'n1', isActive: false });
    await controller.setActive('names', 'n1', { isActive: false });
    expect(service.setActive).toHaveBeenCalledWith('names', 'n1', false);
  });

  it('remove delegates and returns void', async () => {
    service.remove.mockResolvedValue(undefined);
    const result = await controller.remove('names', 'n1');
    expect(service.remove).toHaveBeenCalledWith('names', 'n1');
    expect(result).toBeUndefined();
  });
});
