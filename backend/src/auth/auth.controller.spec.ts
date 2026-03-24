import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { ThrottlerModule } from '@nestjs/throttler';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock };
  let usersService: { create: jest.Mock };

  beforeEach(async () => {
    authService = { login: jest.fn() };
    usersService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot()],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should delegate to authService.login and return the result', async () => {
      authService.login.mockResolvedValue({ access_token: 'jwt-token' });

      const result = await controller.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(authService.login).toHaveBeenCalledWith('testuser', 'password123');
      expect(result).toEqual({ access_token: 'jwt-token' });
    });

    it('should propagate UnauthorizedException from authService', async () => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));

      await expect(controller.login({ username: 'bad', password: 'bad' })).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('register', () => {
    it('should create user then login and return access token', async () => {
      usersService.create.mockResolvedValue(undefined);
      authService.login.mockResolvedValue({ access_token: 'new-jwt' });

      const result = await controller.register({
        username: 'newuser',
        password: 'securepass123',
        displayName: 'New User',
        email: 'new@example.com',
      });

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'securepass123',
        displayName: 'New User',
        email: 'new@example.com',
      });
      expect(authService.login).toHaveBeenCalledWith('newuser', 'securepass123');
      expect(result).toEqual({ access_token: 'new-jwt' });
    });

    it('should pass optional fields as undefined when not provided', async () => {
      usersService.create.mockResolvedValue(undefined);
      authService.login.mockResolvedValue({ access_token: 'token' });

      await controller.register({
        username: 'minuser',
        password: 'securepass123',
      });

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'minuser',
        password: 'securepass123',
        displayName: undefined,
        email: undefined,
      });
    });

    it('should propagate errors from usersService.create', async () => {
      usersService.create.mockRejectedValue(new Error('Username taken'));

      await expect(
        controller.register({
          username: 'taken',
          password: 'securepass123',
        })
      ).rejects.toThrow('Username taken');

      expect(authService.login).not.toHaveBeenCalled();
    });
  });
});
