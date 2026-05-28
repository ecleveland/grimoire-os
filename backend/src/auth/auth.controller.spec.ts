import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from './auth-cookie.config';
import { mockUserPublic } from '../test/fixtures';

function createMockResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function reqWithCookies(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; signAccessTokenForUserId: jest.Mock };
  let usersService: { create: jest.Mock };
  let refreshTokenService: {
    issue: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
  };
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    authService = { login: jest.fn(), signAccessTokenForUserId: jest.fn() };
    usersService = { create: jest.fn() };
    refreshTokenService = {
      issue: jest.fn(),
      rotate: jest.fn(),
      revoke: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot()],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: RefreshTokenService, useValue: refreshTokenService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('login', () => {
    it('sets the JWT access cookie and a refresh cookie, returns user (no tokens in body)', async () => {
      authService.login.mockResolvedValue({
        access_token: 'jwt-token',
        user: mockUserPublic,
      });
      refreshTokenService.issue.mockResolvedValue({ token: 'refresh-abc', id: 'r1' });
      const res = createMockResponse();

      const result = await controller.login({ username: 'testuser', password: 'pw' }, res);

      expect(authService.login).toHaveBeenCalledWith('testuser', 'pw');
      expect(refreshTokenService.issue).toHaveBeenCalledWith(mockUserPublic.id);
      const cookieCalls = (res.cookie as jest.Mock).mock.calls;
      const access = cookieCalls.find(c => c[0] === AUTH_COOKIE_NAME);
      const refresh = cookieCalls.find(c => c[0] === REFRESH_COOKIE_NAME);
      expect(access).toBeDefined();
      expect(access[1]).toBe('jwt-token');
      expect(access[2]).toEqual(
        expect.objectContaining({ httpOnly: true, maxAge: AUTH_COOKIE_MAX_AGE_MS })
      );
      expect(refresh).toBeDefined();
      expect(refresh[1]).toBe('refresh-abc');
      expect(refresh[2]).toEqual(
        expect.objectContaining({
          httpOnly: true,
          maxAge: REFRESH_COOKIE_MAX_AGE_MS,
          path: REFRESH_COOKIE_PATH,
        })
      );
      expect(result).toEqual({ user: mockUserPublic });
      expect(result).not.toHaveProperty('access_token');
      expect(result).not.toHaveProperty('refresh_token');
    });

    it('marks both cookies secure when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      authService.login.mockResolvedValue({ access_token: 't', user: mockUserPublic });
      refreshTokenService.issue.mockResolvedValue({ token: 'r', id: 'r1' });
      const res = createMockResponse();

      await controller.login({ username: 'u', password: 'p' }, res);

      const calls = (res.cookie as jest.Mock).mock.calls;
      expect(calls.find(c => c[0] === AUTH_COOKIE_NAME)[2].secure).toBe(true);
      expect(calls.find(c => c[0] === REFRESH_COOKIE_NAME)[2].secure).toBe(true);
    });

    it('does NOT issue a refresh token when login fails', async () => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));
      const res = createMockResponse();

      await expect(controller.login({ username: 'bad', password: 'bad' }, res)).rejects.toThrow(
        'Invalid credentials'
      );
      expect(refreshTokenService.issue).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('issues access + refresh cookies after creating the user', async () => {
      usersService.create.mockResolvedValue(undefined);
      authService.login.mockResolvedValue({
        access_token: 'new-jwt',
        user: mockUserPublic,
      });
      refreshTokenService.issue.mockResolvedValue({ token: 'refresh-xyz', id: 'r2' });
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

      expect(refreshTokenService.issue).toHaveBeenCalledWith(mockUserPublic.id);
      const calls = (res.cookie as jest.Mock).mock.calls;
      expect(calls.some(c => c[0] === AUTH_COOKIE_NAME && c[1] === 'new-jwt')).toBe(true);
      expect(calls.some(c => c[0] === REFRESH_COOKIE_NAME && c[1] === 'refresh-xyz')).toBe(true);
      expect(result).toEqual({ user: mockUserPublic });
    });

    it('does not issue a refresh token when user creation fails', async () => {
      usersService.create.mockRejectedValue(new Error('Username taken'));
      const res = createMockResponse();

      await expect(
        controller.register({ username: 'taken', password: 'SecurePass1!23' }, res)
      ).rejects.toThrow('Username taken');
      expect(authService.login).not.toHaveBeenCalled();
      expect(refreshTokenService.issue).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token, signs a new access token, sets both cookies', async () => {
      refreshTokenService.rotate.mockResolvedValue({
        token: 'rotated-refresh',
        userId: mockUserPublic.id,
      });
      authService.signAccessTokenForUserId.mockResolvedValue({
        access_token: 'rotated-access',
        user: mockUserPublic,
      });

      const req = reqWithCookies({ [REFRESH_COOKIE_NAME]: 'presented-refresh' });
      const res = createMockResponse();

      const result = await controller.refresh(req, res);

      expect(refreshTokenService.rotate).toHaveBeenCalledWith('presented-refresh');
      expect(authService.signAccessTokenForUserId).toHaveBeenCalledWith(mockUserPublic.id);
      const calls = (res.cookie as jest.Mock).mock.calls;
      expect(calls.some(c => c[0] === AUTH_COOKIE_NAME && c[1] === 'rotated-access')).toBe(true);
      expect(calls.some(c => c[0] === REFRESH_COOKIE_NAME && c[1] === 'rotated-refresh')).toBe(
        true
      );
      expect(result).toEqual({ user: mockUserPublic });
    });

    it('throws Unauthorized when no refresh cookie is present', async () => {
      const req = reqWithCookies({});
      const res = createMockResponse();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(refreshTokenService.rotate).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('propagates Unauthorized from refresh-token service (invalid/expired/reused)', async () => {
      refreshTokenService.rotate.mockRejectedValue(new UnauthorizedException('Invalid refresh'));
      const req = reqWithCookies({ [REFRESH_COOKIE_NAME]: 'bad' });
      const res = createMockResponse();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears both cookies even when no refresh cookie is present', async () => {
      const req = reqWithCookies({});
      const res = createMockResponse();

      await controller.logout(req, res);

      expect(refreshTokenService.revoke).not.toHaveBeenCalled();
      const calls = (res.clearCookie as jest.Mock).mock.calls;
      expect(calls.some(c => c[0] === AUTH_COOKIE_NAME)).toBe(true);
      expect(calls.some(c => c[0] === REFRESH_COOKIE_NAME)).toBe(true);
    });

    it('revokes the refresh token then clears both cookies when refresh cookie present', async () => {
      refreshTokenService.revoke.mockResolvedValue(undefined);
      const req = reqWithCookies({ [REFRESH_COOKIE_NAME]: 'logging-out' });
      const res = createMockResponse();

      await controller.logout(req, res);

      expect(refreshTokenService.revoke).toHaveBeenCalledWith('logging-out');
      const calls = (res.clearCookie as jest.Mock).mock.calls;
      expect(calls.some(c => c[0] === AUTH_COOKIE_NAME)).toBe(true);
      expect(calls.some(c => c[0] === REFRESH_COOKIE_NAME)).toBe(true);
    });

    it('still clears cookies if revoke throws (idempotent client experience)', async () => {
      refreshTokenService.revoke.mockRejectedValue(new Error('db down'));
      const req = reqWithCookies({ [REFRESH_COOKIE_NAME]: 'x' });
      const res = createMockResponse();

      await controller.logout(req, res);

      const calls = (res.clearCookie as jest.Mock).mock.calls;
      expect(calls.some(c => c[0] === AUTH_COOKIE_NAME)).toBe(true);
      expect(calls.some(c => c[0] === REFRESH_COOKIE_NAME)).toBe(true);
    });
  });
});
