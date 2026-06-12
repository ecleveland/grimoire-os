import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT guard that never rejects: a valid token populates `req.user`, while a
 * missing/expired/invalid one leaves the request anonymous instead of 401ing.
 * For routes that serve the public catalog but widen to the caller's own
 * content when an identity is present (VEG-293).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser | undefined {
    if (err || !user) return undefined;
    return user;
  }
}
