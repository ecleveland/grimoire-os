import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AUTH_COOKIE_MAX_AGE_MS, AUTH_COOKIE_NAME } from './auth-cookie.config';
import { mockUserPublic } from '../test/fixtures';

function createMockResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock };
  let usersService: { create: jest.Mock };
  const originalNodeEnv = process.env.NODE_ENV;

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

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('login', () => {
    it('sets the JWT as an httpOnly cookie and returns the user (no token in body)', async () => {
      authService.login.mockResolvedValue({
        access_token: 'jwt-token',
        user: mockUserPublic,
      });
      const res = createMockResponse();

      const result = await controller.login({ username: 'testuser', password: 'pw' }, res);

      expect(authService.login).toHaveBeenCalledWith('testuser', 'pw');
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        'jwt-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: AUTH_COOKIE_MAX_AGE_MS,
        })
      );
      expect(result).toEqual({ user: mockUserPublic });
      expect(result).not.toHaveProperty('access_token');
    });

    it('marks the cookie secure when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      authService.login.mockResolvedValue({ access_token: 't', user: mockUserPublic });
      const res = createMockResponse();

      await controller.login({ username: 'u', password: 'p' }, res);

      const cookieOpts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(cookieOpts.secure).toBe(true);
    });

    it('does NOT mark the cookie secure outside production', async () => {
      process.env.NODE_ENV = 'development';
      authService.login.mockResolvedValue({ access_token: 't', user: mockUserPublic });
      const res = createMockResponse();

      await controller.login({ username: 'u', password: 'p' }, res);

      const cookieOpts = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(cookieOpts.secure).toBe(false);
    });

    it('propagates errors from authService and does not set a cookie', async () => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));
      const res = createMockResponse();

      await expect(controller.login({ username: 'bad', password: 'bad' }, res)).rejects.toThrow(
        'Invalid credentials'
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('creates user, logs them in, sets cookie, and returns the user', async () => {
      usersService.create.mockResolvedValue(undefined);
      authService.login.mockResolvedValue({
        access_token: 'new-jwt',
        user: mockUserPublic,
      });
      const res = createMockResponse();

      const result = await controller.register(
        {
          username: 'newuser',
          password: 'SecurePass1!23',
          displayName: 'New User',
          email: 'new@example.com',
        },
        res
      );

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'SecurePass1!23',
        displayName: 'New User',
        email: 'new@example.com',
      });
      expect(authService.login).toHaveBeenCalledWith('newuser', 'SecurePass1!23');
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        'new-jwt',
        expect.objectContaining({ httpOnly: true })
      );
      expect(result).toEqual({ user: mockUserPublic });
      expect(result).not.toHaveProperty('access_token');
    });

    it('passes optional fields as undefined when not provided', async () => {
      usersService.create.mockResolvedValue(undefined);
      authService.login.mockResolvedValue({ access_token: 't', user: mockUserPublic });
      const res = createMockResponse();

      await controller.register({ username: 'minuser', password: 'SecurePass1!23' }, res);

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'minuser',
        password: 'SecurePass1!23',
        displayName: undefined,
        email: undefined,
      });
    });

    it('propagates errors from usersService.create and does not set a cookie', async () => {
      usersService.create.mockRejectedValue(new Error('Username taken'));
      const res = createMockResponse();

      await expect(
        controller.register({ username: 'taken', password: 'SecurePass1!23' }, res)
      ).rejects.toThrow('Username taken');
      expect(authService.login).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the auth cookie with matching path/sameSite so the browser deletes it', () => {
      const res = createMockResponse();

      controller.logout(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      );
    });
  });
});
