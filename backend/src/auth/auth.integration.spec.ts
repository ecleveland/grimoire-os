import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { mockUser, USER_ID } from '../test/fixtures';

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
    it('should register a user and return a valid JWT', async () => {
      const createdUser = {
        ...mockUser,
        passwordHash: 'hashed-password',
      };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findFirst.mockResolvedValue(createdUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await controller.register({
        username: 'newuser',
        password: 'SecurePass1!23',
        displayName: 'New User',
        email: 'new@example.com',
      });

      expect(result).toHaveProperty('access_token');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: 'newuser',
          passwordHash: 'hashed-password',
          displayName: 'New User',
          email: 'new@example.com',
        }),
      });

      // Verify the token is decodable and has correct claims
      const decoded = jwtService.verify(result.access_token);
      expect(decoded).toMatchObject({
        sub: USER_ID,
        username: 'testuser',
        role: 'player',
      });
    });

    it('should propagate ConflictException on duplicate username', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      await expect(
        controller.register({
          username: 'taken',
          password: 'SecurePass1!23',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should register then login with same credentials producing valid tokens', async () => {
      const createdUser = { ...mockUser, passwordHash: 'hashed-password' };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findFirst.mockResolvedValue(createdUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const registerResult = await controller.register({
        username: 'testuser',
        password: 'SecurePass1!23',
      });

      const loginResult = await controller.login({
        username: 'testuser',
        password: 'SecurePass1!23',
      });

      // Both produce valid tokens
      const registerDecoded = jwtService.verify(registerResult.access_token);
      const loginDecoded = jwtService.verify(loginResult.access_token);
      expect(registerDecoded.sub).toBe(loginDecoded.sub);
      expect(registerDecoded.username).toBe(loginDecoded.username);
    });
  });

  describe('login', () => {
    it('should return a valid access_token for correct credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await controller.login({
        username: 'testuser',
        password: 'correctpassword',
      });

      expect(result).toHaveProperty('access_token');
      expect(typeof result.access_token).toBe('string');
    });

    it('should throw UnauthorizedException for unknown user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(controller.login({ username: 'ghost', password: 'password' })).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(controller.login({ username: 'testuser', password: 'wrong' })).rejects.toThrow(
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
