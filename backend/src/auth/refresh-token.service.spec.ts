import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { USER_ID } from '../test/fixtures';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: MockPrismaService;
  const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'auth.refreshTokenTtlMs') return REFRESH_TTL_MS;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('creates a refresh token row with hashed token and userId', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'token-row-id' });

      const result = await service.issue(USER_ID);

      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThanOrEqual(32);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          tokenHash: hash(result.token),
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('sets expiresAt to now + refreshTokenTtlMs', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'token-row-id' });
      const before = Date.now();

      await service.issue(USER_ID);

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      const expiresAt = (data.expiresAt as Date).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + REFRESH_TTL_MS - 1000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + REFRESH_TTL_MS + 1000);
    });

    it('returns a different token on every call', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'r' });

      const a = await service.issue(USER_ID);
      const b = await service.issue(USER_ID);

      expect(a.token).not.toBe(b.token);
    });

    it('never stores the raw token, only its hash', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 'r' });

      const { token } = await service.issue(USER_ID);

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(hash(token));
      expect(Object.values(data)).not.toContain(token);
    });
  });

  describe('rotate', () => {
    const oldToken = 'valid-refresh-token-abc';
    const liveRow = () => ({
      id: 'old-row',
      userId: USER_ID,
      tokenHash: hash(oldToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedById: null,
    });

    it('returns a new token + revokes the presented one when valid', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRow());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-row', ...data })
      );
      prisma.refreshToken.update.mockResolvedValue({});

      const result = await service.rotate(oldToken);

      expect(result.userId).toBe(USER_ID);
      expect(typeof result.token).toBe('string');
      expect(result.token).not.toBe(oldToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'old-row' },
        data: { replacedById: 'new-row' },
      });
    });

    it('claims the presented token with a conditional updateMany inside a transaction', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRow());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'new-row' });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.rotate(oldToken);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: hash(oldToken), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('treats a lost claim race (count 0 on a live row) as reuse and revokes all user tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRow());
      prisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 }) // claim lost: concurrent rotation won
        .mockResolvedValueOnce({ count: 2 }); // revoke-all response

      await expect(service.rotate(oldToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the token is not found', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate('does-not-exist')).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized when the token is expired', async () => {
      const expiredToken = 'expired-token';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r',
        userId: USER_ID,
        tokenHash: hash(expiredToken),
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        replacedById: null,
      });

      await expect(service.rotate(expiredToken)).rejects.toThrow(UnauthorizedException);
    });

    it('detects reuse: when presented token is already revoked, revokes all user tokens', async () => {
      const reusedToken = 'reused-token';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r',
        userId: USER_ID,
        tokenHash: hash(reusedToken),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 5000),
        replacedById: 'r2',
      });
      prisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 }) // claim fails: row already revoked
        .mockResolvedValueOnce({ count: 3 });

      await expect(service.rotate(reusedToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('looks up the token by its hash, never by raw value', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await service.rotate('some-token').catch(() => {});

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hash('some-token') },
      });
    });
  });

  describe('purgeExpired', () => {
    it('deletes only rows that are past their expiry and returns the count', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 4 });

      const purged = await service.purgeExpired();

      expect(purged).toBe(4);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe('revoke', () => {
    it('marks the token as revoked if present and not already revoked', async () => {
      const token = 'logout-token';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r',
        userId: USER_ID,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedById: null,
      });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.revoke(token);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'r' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does nothing if the token is not found (idempotent logout)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.revoke('missing')).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('does nothing if the token is already revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r',
        userId: USER_ID,
        tokenHash: hash('t'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        replacedById: null,
      });

      await service.revoke('t');

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
