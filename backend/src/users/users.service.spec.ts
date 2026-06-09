import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { USER_ID, mockUser, mockUserPublic, createUserDto } from '../test/fixtures';
import { Role } from '../common/enums';
import { UserDto } from './dto/user-response.dto';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: MockPrismaService;
  let refreshTokens: { revokeAllForUser: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    refreshTokens = { revokeAllForUser: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RefreshTokenService, useValue: refreshTokens },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should hash the password and create a user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      prisma.user.create.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed_pw',
      });

      const result = await service.create(createUserDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          username: createUserDto.username,
          passwordHash: 'hashed_pw',
          displayName: createUserDto.displayName,
          email: createUserDto.email,
          avatarUrl: undefined,
          role: 'player',
        },
      });
      expect(result.passwordHash).toBe('hashed_pw');
    });

    it('should default to Role.PLAYER when no role is provided', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      prisma.user.create.mockResolvedValue({ ...mockUser, passwordHash: 'hashed_pw' });

      await service.create(createUserDto);

      const callData = prisma.user.create.mock.calls[0][0].data;
      expect(callData.role).toBe(Role.PLAYER);
    });

    it('should throw ConflictException on duplicate username/email (P2002)', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      prisma.user.create.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users without passwordHash', async () => {
      prisma.user.findMany.mockResolvedValue([mockUserPublic]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        omit: { passwordHash: true },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [mockUserPublic],
        total: 1,
        page: 1,
        lastPage: 1,
      });
    });

    it('maps each row to a UserDto, dropping internal columns', async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...mockUserPublic, failedLoginAttempts: 9, lockoutUntil: new Date() },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0]).toBeInstanceOf(UserDto);
      expect(result.data[0]).toEqual(mockUserPublic);
    });
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOnePublic', () => {
    it('should return user without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserPublic);

      const result = await service.findOnePublic(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        omit: { passwordHash: true },
      });
      expect(result).toEqual(mockUserPublic);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOnePublic(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('strips failedLoginAttempts and lockoutUntil even if the row carries them', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUserPublic,
        failedLoginAttempts: 3,
        lockoutUntil: new Date('2025-02-01T00:00:00Z'),
      });

      const result = await service.findOnePublic(USER_ID);

      expect(result).toBeInstanceOf(UserDto);
      expect(result).toEqual(mockUserPublic);
      expect((result as unknown as Record<string, unknown>).failedLoginAttempts).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).lockoutUntil).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('findByUsername', () => {
    it('should return user by username', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('update', () => {
    it('should return updated user without passwordHash', async () => {
      const updated = { ...mockUserPublic, displayName: 'Updated' };
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update(USER_ID, { displayName: 'Updated' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { displayName: 'Updated' },
        omit: { passwordHash: true },
      });
      expect(result).toEqual(updated);
      expect(result).toBeInstanceOf(UserDto);
    });

    it('revokes live refresh tokens when the update changes the role', async () => {
      const updated = { ...mockUserPublic, role: Role.DUNGEON_MASTER };
      prisma.user.update.mockResolvedValue(updated);

      await service.update(USER_ID, { role: Role.DUNGEON_MASTER });

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.anything());
    });

    it('does not revoke refresh tokens for updates that do not touch the role', async () => {
      prisma.user.update.mockResolvedValue({ ...mockUserPublic, displayName: 'Updated' });

      await service.update(USER_ID, { displayName: 'Updated' });

      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('should throw UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(USER_ID, 'wrongpassword', 'newpassword')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should hash new password and update when current password is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_pw');
      prisma.user.update.mockResolvedValue({ ...mockUser, passwordHash: 'new_hashed_pw' });

      await service.changePassword(USER_ID, 'correctpassword', 'newpassword');

      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', mockUser.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passwordHash: 'new_hashed_pw' },
      });
    });

    it('revokes all live refresh tokens in the same transaction as the password update', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_pw');
      prisma.user.update.mockResolvedValue({ ...mockUser, passwordHash: 'new_hashed_pw' });

      await service.changePassword(USER_ID, 'correctpassword', 'newpassword');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER_ID, expect.anything());
    });

    it('does not revoke refresh tokens when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(USER_ID, 'wrongpassword', 'newpassword')).rejects.toThrow(
        UnauthorizedException
      );
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('recordFailedLogin', () => {
    it('increments failedLoginAttempts by 1', async () => {
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 1 });

      await service.recordFailedLogin(USER_ID, 0);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { failedLoginAttempts: { increment: 1 } },
      });
    });

    it('sets lockoutUntil when attempts reach threshold', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockoutUntil: new Date(),
      });

      await service.recordFailedLogin(USER_ID, 4);

      const callData = prisma.user.update.mock.calls[0][0].data;
      expect(callData.failedLoginAttempts).toEqual({ increment: 1 });
      expect(callData.lockoutUntil).toBeInstanceOf(Date);
    });

    it('does not set lockoutUntil when below threshold', async () => {
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 2 });

      await service.recordFailedLogin(USER_ID, 1);

      const callData = prisma.user.update.mock.calls[0][0].data;
      expect(callData.lockoutUntil).toBeUndefined();
    });
  });

  describe('resetFailedLogin', () => {
    it('resets failedLoginAttempts and lockoutUntil', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      });

      await service.resetFailedLogin(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when user does not exist (P2025)', async () => {
      prisma.user.delete.mockRejectedValue(
        new PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.0.0',
        })
      );

      await expect(service.remove(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it("deletes the user's homebrew content with the user in one transaction", async () => {
      prisma.spell.deleteMany.mockResolvedValue({ count: 1 });
      prisma.monster.deleteMany.mockResolvedValue({ count: 0 });
      prisma.item.deleteMany.mockResolvedValue({ count: 2 });
      prisma.feat.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.delete.mockResolvedValue(mockUser);

      await service.remove(USER_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
      for (const model of [prisma.spell, prisma.monster, prisma.item, prisma.feat]) {
        expect(model.deleteMany).toHaveBeenCalledWith({
          where: { createdById: USER_ID, contentSource: 'homebrew' },
        });
      }
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    });
  });
});
