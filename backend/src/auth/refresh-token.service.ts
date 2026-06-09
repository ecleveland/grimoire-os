import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface RotatedRefreshToken {
  token: string;
  userId: string;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}

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
    return this.prisma.$transaction(async tx => {
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });

      if (!existing) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Atomically claim the token: only one rotation can flip revokedAt from
      // null. count === 0 means the row was already revoked — either a replay
      // of a stolen token or a lost race between concurrent refreshes. Both
      // get the defense-in-depth response of revoking every live token for
      // the user.
      const claimed = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) {
        await tx.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException('Refresh token reuse detected');
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
