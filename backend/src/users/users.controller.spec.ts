import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { USER_ID, mockUserPublic } from '../test/fixtures';
import { Role } from '../common/enums';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Record<string, jest.Mock>;

  const mockReq = {
    user: { userId: USER_ID, username: 'testuser', role: Role.PLAYER },
  } as AuthenticatedRequest;

  beforeEach(async () => {
    service = {
      findOnePublic: jest.fn(),
      update: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('getProfile', () => {
    it('delegates to findOnePublic with userId', async () => {
      service.findOnePublic.mockResolvedValue(mockUserPublic);

      const result = await controller.getProfile(mockReq);

      expect(service.findOnePublic).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(mockUserPublic);
    });
  });

  describe('updateProfile', () => {
    it('delegates to update with userId and dto', async () => {
      const dto = { displayName: 'New Name' };
      service.update.mockResolvedValue({ ...mockUserPublic, ...dto });

      const result = await controller.updateProfile(mockReq, dto as any);

      expect(service.update).toHaveBeenCalledWith(USER_ID, dto);
      expect(result.displayName).toBe('New Name');
    });
  });

  describe('changePassword', () => {
    it('delegates to changePassword with userId and passwords', async () => {
      const dto = { currentPassword: 'oldpass', newPassword: 'newpass' };
      service.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(mockReq, dto as any);

      expect(service.changePassword).toHaveBeenCalledWith(USER_ID, 'oldpass', 'newpass');
    });
  });
});
