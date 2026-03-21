import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtUser } from '../interfaces/jwt-payload.interface';

function extractJwtFromCookie(req: Request): string | null {
  return req?.cookies?.token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    super({
      jwtFromRequest: extractJwtFromCookie,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: string; username: string; role: string }): JwtUser {
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
