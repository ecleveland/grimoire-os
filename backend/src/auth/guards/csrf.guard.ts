import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../csrf-cookie.config';

export const CSRF_SKIP_KEY = 'csrf:skip';

// Exempts a handler from CSRF protection. Two legitimate categories:
//   1. Auth endpoints (login/register/refresh/logout) that mint or clear the
//      CSRF cookie themselves — they cannot require a token not yet issued.
//   2. Read-only, side-effect-free POSTs reachable by anonymous callers, who
//      never get a csrf cookie minted (e.g. SrdController.hydrateCards / the
//      /srd/print batch hydrate, VEG-332). CSRF guards state-changing requests;
//      it buys nothing on a pure read.
// Only apply to (2) when the handler genuinely performs no writes — confidentiality
// of any authenticated response then rests on the CORS origin allow-list, not CSRF.
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(CSRF_SKIP_KEY, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(CSRF_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const rawHeader = req.headers[CSRF_HEADER_NAME];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken !== headerToken
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
