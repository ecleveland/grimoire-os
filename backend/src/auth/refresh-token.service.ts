import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface RotatedRefreshToken {
  token: string;
  userId: string;
}

/** Accepts either the root client or a `$transaction` client. */
type RefreshTokenClient = Pick<PrismaService, 'refreshToken'> | Prisma.TransactionClient;

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}

  /**
   * Revoke every live (non-revoked) refresh token for a user. The single
   * conditional `updateMany` is the canonical session-invalidation primitive —
   * used on password change, role change, and reuse detection. Pass a
   * transaction client to enlist it in a caller's transaction.
   */
  async revokeAllForUser(
    userId: string,
    client: RefreshTokenClient = this.prisma
  ): Promise<number> {
    const { count } = await client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async issue(userId: string): Promise<{ token: string; id: string }> {
    const token = this.generateOpaqueToken();
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + this.ttlMs()),
      },
    });
    return { token, id: row.id };
  }

  async rotate(presentedToken: string): Promise<RotatedRefreshToken> {
    const tokenHash = this.hash(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Atomically claim the token: the conditional `updateMany` flips revokedAt
    // null→set in a single locked statement, so concurrent rotations serialize
    // and exactly one wins. count === 0 means the row was already revoked — a
    // replay of a stolen token or the loser of a race. Either way it is the
    // reuse signal, and it must be checked BEFORE expiry so a late replay of a
    // revoked token still trips the defense.
    //
    // The reuse revoke-all runs on the root client (NOT inside a transaction
    // that then throws) so it actually commits — a throw inside an interactive
    // transaction would roll the revocation back, defeating the response.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      const revoked = await this.revokeAllForUser(existing.userId);
      this.logger.warn(
        `Refresh token reuse detected for user ${existing.userId}; revoked ${revoked} live token(s)`
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // The presented token is now revoked (claimed above). Reject if it had
    // already expired — harmless that the claim revoked it in passing.
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newToken = this.generateOpaqueToken();
    const newRow = await this.prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: this.hash(newToken),
        expiresAt: new Date(Date.now() + this.ttlMs()),
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { replacedById: newRow.id },
    });

    return { token: newToken, userId: existing.userId };
  }

  /**
   * Opportunistic cleanup: expired rows are dead weight (they can never
   * authenticate again) but nothing deleted them before VEG-317. Called on
   * login; cheap thanks to the expiresAt index.
   */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }

  async revoke(presentedToken: string): Promise<void> {
    const tokenHash = this.hash(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt) return;
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlMs(): number {
    return this.configService.get<number>('auth.refreshTokenTtlMs') ?? DEFAULT_TTL_MS;
  }
}
