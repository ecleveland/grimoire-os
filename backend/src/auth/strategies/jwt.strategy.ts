import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtUser } from '../interfaces/jwt-payload.interface';
import { Role } from '../../common/enums';
import { AUTH_COOKIE_NAME } from '../auth-cookie.config';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const secret = configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    super({
      // Cookie comes first so browser sessions never accidentally fall back to
      // a stale Authorization header. The Bearer extractor is kept so internal
      // API clients and supertest can still pass tokens.
      jwtFromRequest: jwtTokenExtractor,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * A signature check alone would keep a deleted account authenticated until
   * its token expires, so every request confirms the user row still exists.
   * Username and role come from the row, which makes a role change or rename
   * apply on the next request instead of at the next login.
   */
  async validate(payload: { sub: string; username: string; role: Role }): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      userId: user.id,
      username: user.username,
      role: user.role as Role,
    };
  }
}
