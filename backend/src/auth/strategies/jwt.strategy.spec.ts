import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { cookieExtractor, JwtStrategy } from './jwt.strategy';
import { AUTH_COOKIE_NAME } from '../auth-cookie.config';
import { Role } from '../../common/enums';

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('should throw if JWT_SECRET is not set', () => {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(configService)).toThrow(
        'JWT_SECRET environment variable is not set'
      );
    });

    it('should create successfully when JWT_SECRET is set', () => {
      const configService = {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService;

      const strategy = new JwtStrategy(configService);
      expect(strategy).toBeDefined();
    });
  });

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      const configService = {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService;
      strategy = new JwtStrategy(configService);
    });

    it('should transform JWT payload into JwtUser object', () => {
      const payload = {
        sub: 'user-123',
        username: 'testuser',
        role: Role.PLAYER,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-123',
        username: 'testuser',
        role: 'player',
      });
    });

    it('should map sub to userId', () => {
      const payload = {
        sub: 'abc-def',
        username: 'admin',
        role: Role.ADMIN,
      };

      const result = strategy.validate(payload);

      expect(result.userId).toBe('abc-def');
      expect(result).not.toHaveProperty('sub');
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
