import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { cookieExtractor } from '../strategies/jwt.strategy';

/**
 * JWT guard for routes that serve anonymous callers but widen to the caller's
 * own content when an identity is present (VEG-293/VEG-331).
 *
 * - No credentials at all → the request proceeds anonymously (no 401).
 * - Credentials present but invalid/expired → standard 401. This is deliberate:
 *   a silent fallback to anonymous would make a user's expired session
 *   indistinguishable from "your homebrew doesn't exist" (200 with their
 *   content missing), and would bypass the client's 401-triggered token
 *   refresh — so the stale session would never heal.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (!hasCredentials(req)) return true;
    return super.canActivate(context);
  }
}

/** Mirrors the JwtStrategy extractors: auth cookie first, then bearer header. */
function hasCredentials(req: Request): boolean {
  if (cookieExtractor(req) !== null) return true;
  const authorization = req.headers?.authorization;
  return typeof authorization === 'string' && /^bearer /i.test(authorization);
}
