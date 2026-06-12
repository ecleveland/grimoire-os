import { Request } from 'express';
import { Role } from '../../common/enums';

export interface JwtUser {
  userId: string;
  username: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: JwtUser;
}

/**
 * Request shape behind {@link OptionalJwtAuthGuard}: `user` is set only when a
 * valid JWT rode along; anonymous callers are served rather than 401ed.
 */
export interface OptionallyAuthenticatedRequest extends Request {
  user?: JwtUser;
}
