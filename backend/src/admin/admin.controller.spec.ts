import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { UsersService } from '../users/users.service';
import { USER_ID, mockUserPublic } from '../test/fixtures';

describe('AdminController', () => {
  let controller: AdminController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('findAllUsers', () => {
    it('delegates to findAll with pagination', async () => {
      const pagination = { page: 1, limit: 20 };
      const paginated = { data: [mockUserPublic], total: 1, page: 1, lastPage: 1 };
      service.findAll.mockResolvedValue(paginated);

      const result = await controller.findAllUsers(pagination);

      expect(service.findAll).toHaveBeenCalledWith(pagination);
      expect(result).toEqual(paginated);
    });
  });

  describe('updateUser', () => {
    it('delegates to update with id and dto', async () => {
      const dto = { role: 'admin' };
      service.update.mockResolvedValue({ ...mockUserPublic, ...dto });

      const result = await controller.updateUser(USER_ID, dto as any);

      expect(service.update).toHaveBeenCalledWith(USER_ID, dto);
      expect(result.role).toBe('admin');
    });
  });

  describe('removeUser', () => {
    it('delegates to remove with id', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.removeUser(USER_ID);

      expect(service.remove).toHaveBeenCalledWith(USER_ID);
    });
  });
});
