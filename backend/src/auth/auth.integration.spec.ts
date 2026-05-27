import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { mockUser, USER_ID } from '../test/fixtures';
import { AUTH_COOKIE_NAME } from './auth-cookie.config';

function createMockResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  } as unknown as Response;
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
              auth: { jwtSecret: TEST_SECRET, jwtExpiresIn: '1h' },
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
    it('should register a user, set the auth cookie, and return the public user', async () => {
      const createdUser = {
        ...mockUser,
        passwordHash: 'hashed-password',
      };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findFirst.mockResolvedValue(createdUser);
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

      // The cookie value must be a JWT the server can verify.
      const cookieCalls = (res.cookie as jest.Mock).mock.calls;
      expect(cookieCalls).toHaveLength(1);
      const [name, token] = cookieCalls[0];
      expect(name).toBe(AUTH_COOKIE_NAME);
      expect(jwtService.verify(token)).toMatchObject({
        sub: USER_ID,
        username: 'testuser',
        role: 'player',
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
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const regRes = createMockResponse();
      const loginRes = createMockResponse();

      await controller.register({ username: 'testuser', password: 'SecurePass1!23' }, regRes);
      await controller.login({ username: 'testuser', password: 'SecurePass1!23' }, loginRes);

      const regToken = (regRes.cookie as jest.Mock).mock.calls[0][1];
      const loginToken = (loginRes.cookie as jest.Mock).mock.calls[0][1];
      const registerDecoded = jwtService.verify(regToken);
      const loginDecoded = jwtService.verify(loginToken);
      expect(registerDecoded.sub).toBe(loginDecoded.sub);
      expect(registerDecoded.username).toBe(loginDecoded.username);
    });
  });

  describe('login', () => {
    it('should set a valid JWT cookie and return the public user', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const res = createMockResponse();

      const result = await controller.login(
        { username: 'testuser', password: 'correctpassword' },
        res
      );

      expect(result).not.toHaveProperty('access_token');
      expect(result.user.id).toBe(USER_ID);
      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [name, token] = (res.cookie as jest.Mock).mock.calls[0];
      expect(name).toBe(AUTH_COOKIE_NAME);
      expect(typeof token).toBe('string');
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
    it('clears the auth cookie', () => {
      const res = createMockResponse();
      controller.logout(res);
      expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, expect.any(Object));
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
