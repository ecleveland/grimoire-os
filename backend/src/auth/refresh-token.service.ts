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
const DEFAULT_ROTATION_GRACE_MS = 10_000;

/** Thrown inside the rotation transaction when another request already claimed the token. */
class LostClaim extends Error {}

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
    // and exactly one wins. The claim, the new row and the replacedById link
    // commit together, so a racing loser's claim blocks on the row lock until
    // the winner commits and its re-read then sees the link. count === 0 means
    // the row was already revoked, by a replay of a stolen token or by the
    // loser of a race. That check must run BEFORE expiry so a late replay of a
    // revoked token still trips the defense.
    try {
      return await this.prisma.$transaction(async tx => {
        const claimed = await tx.refreshToken.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (claimed.count === 0) throw new LostClaim();

        // Reject an expired token. The throw rolls the claim back, which is
        // harmless because the row stays expired.
        if (existing.expiresAt.getTime() <= Date.now()) {
          throw new UnauthorizedException('Refresh token expired');
        }

        const newToken = this.generateOpaqueToken();
        const newRow = await tx.refreshToken.create({
          data: {
            userId: existing.userId,
            tokenHash: this.hash(newToken),
            expiresAt: new Date(Date.now() + this.ttlMs()),
          },
        });

        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { replacedById: newRow.id },
        });

        return { token: newToken, userId: existing.userId };
      });
    } catch (err) {
      if (!(err instanceof LostClaim)) throw err;
      return this.rejectLostClaim(tokenHash, existing.userId);
    }
  }

  /**
   * Handles a lost claim on the root client. The reuse revoke-all must NOT run
   * inside a transaction that then throws, or the throw would roll the
   * revocation back and defeat the response.
   */
  private async rejectLostClaim(tokenHash: string, userId: string): Promise<never> {
    // Re-read: the snapshot taken before the claim predates the rotation that
    // beat us. A replay of a token that was rotated within the grace window is
    // the same browser racing itself (a second tab, cookie-write lag). It gets
    // a plain 401 and the family stays alive. A token revoked by logout or by
    // a revoke-all sweep has no replacedById, so replaying one of those still
    // revokes everything.
    const current = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (
      current?.replacedById != null &&
      current.revokedAt != null &&
      Date.now() - current.revokedAt.getTime() <= this.rotationGraceMs()
    ) {
      this.logger.debug(
        `Refresh token for user ${userId} replayed within the rotation grace window`
      );
      throw new UnauthorizedException('Refresh token already rotated');
    }
    const revoked = await this.revokeAllForUser(userId);
    this.logger.warn(
      `Refresh token reuse detected for user ${userId}; revoked ${revoked} live token(s)`
    );
    throw new UnauthorizedException('Refresh token reuse detected');
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

  private rotationGraceMs(): number {
    return (
      this.configService.get<number>('auth.refreshRotationGraceMs') ?? DEFAULT_ROTATION_GRACE_MS
    );
  }
}
