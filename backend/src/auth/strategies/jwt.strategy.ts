import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtUser } from '../interfaces/jwt-payload.interface';
import { Role } from '../../common/enums';
import { AUTH_COOKIE_NAME } from '../auth-cookie.config';

export function cookieExtractor(req?: Request): string | null {
  const token = req?.cookies?.[AUTH_COOKIE_NAME];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * The full credential-extraction chain this strategy authenticates with.
 * Shared with OptionalJwtAuthGuard so "are credentials present?" can never
 * drift from what the strategy would actually try to verify.
 */
export const jwtTokenExtractor = ExtractJwt.fromExtractors([
  cookieExtractor,
  ExtractJwt.fromAuthHeaderAsBearerToken(),
]);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    super({
      // Cookie comes first so browser sessions never accidentally fall back to
      // a stale Authorization header. The Bearer extractor is kept so internal
      // API clients, supertest, and the websocket gateway can still pass tokens.
      jwtFromRequest: jwtTokenExtractor,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: string; username: string; role: Role }): JwtUser {
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
