import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { cookieExtractor, JwtStrategy } from './jwt.strategy';
import { AUTH_COOKIE_NAME } from '../auth-cookie.config';
import { Role } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService, MockPrismaService } from '../../test/prisma-mock.factory';

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('should throw if JWT_SECRET is not set', () => {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(configService, {} as PrismaService)).toThrow(
        'JWT_SECRET environment variable is not set'
      );
    });

    it('should create successfully when JWT_SECRET is set', () => {
      const configService = {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService;

      const strategy = new JwtStrategy(configService, {} as PrismaService);
      expect(strategy).toBeDefined();
    });
  });

  describe('validate', () => {
    let strategy: JwtStrategy;
    let prisma: MockPrismaService;

    beforeEach(() => {
      const configService = {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService;
      prisma = createMockPrismaService();
      strategy = new JwtStrategy(configService, prisma as unknown as PrismaService);
    });

    it('returns a JwtUser built from the user row when the user still exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        role: Role.PLAYER,
      });

      const result = await strategy.validate({
        sub: 'user-123',
        username: 'testuser',
        role: Role.PLAYER,
      });

      expect(result).toEqual({ userId: 'user-123', username: 'testuser', role: 'player' });
      expect(result).not.toHaveProperty('sub');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { id: true, username: true, role: true },
      });
    });

    it('rejects a token whose user has been deleted with a 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 'gone-user', username: 'ghost', role: Role.PLAYER })
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('takes the role from the user row so a role change applies before the token expires', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'abc-def',
        username: 'demoted',
        role: Role.PLAYER,
      });

      const result = await strategy.validate({
        sub: 'abc-def',
        username: 'demoted',
        role: Role.ADMIN,
      });

      expect(result.role).toBe(Role.PLAYER);
    });
  });

  describe('cookieExtractor', () => {
    it('returns the access_token cookie value when present', () => {
      const req = { cookies: { [AUTH_COOKIE_NAME]: 'cookie.jwt.token' } } as unknown as Request;
      expect(cookieExtractor(req)).toBe('cookie.jwt.token');
    });

    it('returns null when the cookie is missing', () => {
      const req = { cookies: {} } as unknown as Request;
      expect(cookieExtractor(req)).toBeNull();
    });

    it('returns null when req is undefined', () => {
      expect(cookieExtractor(undefined)).toBeNull();
    });

    it('returns null when req has no cookies object (cookie-parser not wired)', () => {
      const req = {} as unknown as Request;
      expect(cookieExtractor(req)).toBeNull();
    });
  });
});
