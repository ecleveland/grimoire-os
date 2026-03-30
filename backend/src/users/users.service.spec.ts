import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import { USER_ID, mockUser, mockUserPublic, createUserDto } from '../test/fixtures';
import { Role } from '../common/enums';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
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

      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 10);
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

  describe('changePassword', () => {
    it('should throw UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(USER_ID, 'wrongpassword', 'newpassword')).rejects.toThrow(
        UnauthorizedException
      );
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
  });
});
