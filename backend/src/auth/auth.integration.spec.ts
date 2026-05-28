import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { mockUser, USER_ID } from '../test/fixtures';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME } from './auth-cookie.config';
import { CSRF_COOKIE_NAME } from './csrf-cookie.config';

function createMockResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function reqWithCookies(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

const TEST_SECRET = 'integration-test-secret';

describe('Auth Integration', () => {
  let module: TestingModule;
  let controller: AuthController;
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              auth: {
                jwtSecret: TEST_SECRET,
                jwtExpiresIn: '1h',
                refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
              },
            }),
          ],
        }),
        ThrottlerModule.forRoot(),
        PrismaModule,
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('register → login flow', () => {
    it('should register a user, set access + refresh cookies, and return the public user', async () => {
      const createdUser = {
        ...mockUser,
        passwordHash: 'hashed-password',
      };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findFirst.mockResolvedValue(createdUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'r-1' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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

      expect(result).not.toHaveProperty('access_token');
      expect(result.user).toMatchObject({
        id: USER_ID,
        username: 'testuser',
        role: 'player',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: 'newuser',
          passwordHash: 'hashed-password',
          displayName: 'New User',
          email: 'new@example.com',
        }),
      });

      // Both cookies must be set; the access cookie value must be a JWT the
      // server can verify and the refresh token must have been persisted.
      const cookieCalls = (res.cookie as jest.Mock).mock.calls;
      const access = cookieCalls.find(c => c[0] === AUTH_COOKIE_NAME);
      const refresh = cookieCalls.find(c => c[0] === REFRESH_COOKIE_NAME);
      expect(access).toBeDefined();
      expect(refresh).toBeDefined();
      expect(jwtService.verify(access[1])).toMatchObject({
        sub: USER_ID,
        username: 'testuser',
        role: 'player',
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER_ID }),
      });
    });

    it('should propagate ConflictException on duplicate username and not set a cookie', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );
      const res = createMockResponse();

      await expect(
        controller.register({ username: 'taken', password: 'SecurePass1!23' }, res)
      ).rejects.toThrow(ConflictException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should register then login with same credentials producing valid cookies', async () => {
      const createdUser = { ...mockUser, passwordHash: 'hashed-password' };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findFirst.mockResolvedValue(createdUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'r-1' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const regRes = createMockResponse();
      const loginRes = createMockResponse();

      await controller.register({ username: 'testuser', password: 'SecurePass1!23' }, regRes);
      await controller.login({ username: 'testuser', password: 'SecurePass1!23' }, loginRes);

      const regAccess = (regRes.cookie as jest.Mock).mock.calls.find(
        c => c[0] === AUTH_COOKIE_NAME
      )[1];
      const loginAccess = (loginRes.cookie as jest.Mock).mock.calls.find(
        c => c[0] === AUTH_COOKIE_NAME
      )[1];
      const registerDecoded = jwtService.verify(regAccess);
      const loginDecoded = jwtService.verify(loginAccess);
      expect(registerDecoded.sub).toBe(loginDecoded.sub);
      expect(registerDecoded.username).toBe(loginDecoded.username);
    });
  });

  describe('login', () => {
    it('should set access + refresh cookies and return the public user', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'r-1' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const res = createMockResponse();

      const result = await controller.login(
        { username: 'testuser', password: 'correctpassword' },
        res
      );

      expect(result).not.toHaveProperty('access_token');
      expect(result.user.id).toBe(USER_ID);
      expect(res.cookie).toHaveBeenCalledTimes(3);
      const calls = (res.cookie as jest.Mock).mock.calls;
      const names = calls.map(c => c[0]);
      expect(names).toContain(AUTH_COOKIE_NAME);
      expect(names).toContain(REFRESH_COOKIE_NAME);
      expect(names).toContain(CSRF_COOKIE_NAME);
    });

    it('should throw UnauthorizedException for unknown user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const res = createMockResponse();

      await expect(
        controller.login({ username: 'ghost', password: 'password' }, res)
      ).rejects.toThrow(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const res = createMockResponse();

      await expect(
        controller.login({ username: 'testuser', password: 'wrong' }, res)
      ).rejects.toThrow(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears both auth cookies', async () => {
      const res = createMockResponse();
      await controller.logout(reqWithCookies({}), res);
      const cleared = (res.clearCookie as jest.Mock).mock.calls.map(c => c[0]);
      expect(cleared).toContain(AUTH_COOKIE_NAME);
      expect(cleared).toContain(REFRESH_COOKIE_NAME);
    });

    it('revokes the refresh row when a refresh cookie is present', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'r-1' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // First login to capture an issued refresh token from the cookie.
      const loginRes = createMockResponse();
      await controller.login({ username: 'testuser', password: 'pw' }, loginRes);
      const refreshCookie = (loginRes.cookie as jest.Mock).mock.calls.find(
        c => c[0] === REFRESH_COOKIE_NAME
      )[1] as string;

      // Now logout with that refresh cookie present.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r-1',
        userId: USER_ID,
        tokenHash: 'irrelevant',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: null,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      const logoutRes = createMockResponse();
      await controller.logout(reqWithCookies({ [REFRESH_COOKIE_NAME]: refreshCookie }), logoutRes);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('refresh', () => {
    it('rotates the refresh row, mints a new JWT, sets both cookies', async () => {
      const presentedRefresh = 'presented-refresh-cookie-value';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r-old',
        userId: USER_ID,
        tokenHash: 'whatever',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: null,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'r-new' });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = createMockResponse();
      const result = await controller.refresh(
        reqWithCookies({ [REFRESH_COOKIE_NAME]: presentedRefresh }),
        res
      );

      expect(result.user.id).toBe(USER_ID);
      // Old token marked revoked + chained to new token id.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'r-old' },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          replacedById: 'r-new',
        }),
      });
      const calls = (res.cookie as jest.Mock).mock.calls;
      const access = calls.find(c => c[0] === AUTH_COOKIE_NAME);
      const refresh = calls.find(c => c[0] === REFRESH_COOKIE_NAME);
      expect(access).toBeDefined();
      expect(refresh).toBeDefined();
      // New access cookie must verify with the configured secret.
      expect(jwtService.verify(access[1])).toMatchObject({ sub: USER_ID });
      // New refresh cookie value is different from what was presented.
      expect(refresh[1]).not.toBe(presentedRefresh);
    });

    it('throws Unauthorized + revokes the whole chain when a revoked token is presented (reuse)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r-old',
        userId: USER_ID,
        tokenHash: 'whatever',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 1000),
        replacedById: 'r-newer',
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const res = createMockResponse();
      await expect(
        controller.refresh(reqWithCookies({ [REFRESH_COOKIE_NAME]: 'stolen' }), res)
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when no refresh cookie is present', async () => {
      const res = createMockResponse();
      await expect(controller.refresh(reqWithCookies({}), res)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('JWT token validation', () => {
    it('should produce tokens with correct sub, username, and role claims', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { access_token } = await authService.login('testuser', 'password');
      const decoded = jwtService.verify(access_token);

      expect(decoded).toMatchObject({
        sub: USER_ID,
        username: 'testuser',
        role: 'player',
      });
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    it('should sign tokens with the configured secret', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { access_token } = await authService.login('testuser', 'password');

      // Should verify with correct secret
      expect(() => jwtService.verify(access_token)).not.toThrow();

      // Should fail with wrong secret
      const wrongJwt = new JwtService({ secret: 'wrong-secret' });
      expect(() => wrongJwt.verify(access_token)).toThrow();
    });
  });
});
