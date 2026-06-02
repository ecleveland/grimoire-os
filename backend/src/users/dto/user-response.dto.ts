import { Expose } from 'class-transformer';
import { UserRole } from '../../prisma/enums';

/**
 * Public-facing user shape (VEG-128). Whitelists exactly the fields the API may
 * expose; `passwordHash`, `failedLoginAttempts` and `lockoutUntil` are never
 * `@Expose()`d, so they can never leak even if a query forgets to omit them.
 */
export class UserDto {
  @Expose() id!: string;
  @Expose() username!: string;
  @Expose() displayName!: string;
  @Expose() email!: string | null;
  @Expose() avatarUrl!: string | null;
  @Expose() role!: UserRole;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
