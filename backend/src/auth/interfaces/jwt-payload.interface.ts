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
