import { Module } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

// Standalone so both AuthModule and UsersModule can share RefreshTokenService
// (UsersService needs revokeAllForUser) without a circular import — AuthModule
// already imports UsersModule. Depends only on the global Prisma + Config
// modules, so it needs no imports of its own.
@Module({
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
