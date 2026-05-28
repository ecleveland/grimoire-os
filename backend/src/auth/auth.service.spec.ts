import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { mockUser, mockUserPublic } from '../test/fixtures';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByUsername: jest.Mock;
    findOne: jest.Mock;
    recordFailedLogin: jest.Mock;
    resetFailedLogin: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByUsername: jest.fn(),
      findOne: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
    };
    jwtService = { sign: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return access_token and public user on valid credentials', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed.jwt.token');

      const result = await service.login('testuser', 'correctpassword');

      expect(usersService.findByUsername).toHaveBeenCalledWith('testuser');
      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', mockUser.passwordHash);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).toEqual(mockUserPublic);
    });

    it('should not include passwordHash in returned user', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token');

      const result = await service.login('testuser', 'password');

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(service.login('nonexistent', 'password')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('testuser', 'wrongpassword')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should include sub, username, and role in JWT payload', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token');

      await service.login('testuser', 'password');

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload).toEqual({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
    });

    it('should throw UnauthorizedException when account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockoutUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 min in future
      };
      usersService.findByUsername.mockResolvedValue(lockedUser);

      await expect(service.login('testuser', 'password')).rejects.toThrow(
        'Account temporarily locked. Please try again later.'
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should allow login when lockout has expired and reset counter', async () => {
      const expiredLockoutUser = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockoutUntil: new Date(Date.now() - 1000), // 1 sec in past
      };
      usersService.findByUsername.mockResolvedValue(expiredLockoutUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token');

      const result = await service.login('testuser', 'password');

      expect(result.access_token).toBe('token');
      expect(usersService.resetFailedLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should call recordFailedLogin on wrong password', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('testuser', 'wrongpassword')).rejects.toThrow(
        UnauthorizedException
      );
      expect(usersService.recordFailedLogin).toHaveBeenCalledWith(mockUser.id, 0);
    });

    it('should call resetFailedLogin on successful login when counter > 0', async () => {
      const userWithAttempts = { ...mockUser, failedLoginAttempts: 2 };
      usersService.findByUsername.mockResolvedValue(userWithAttempts);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token');

      await service.login('testuser', 'password');

      expect(usersService.resetFailedLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should not call resetFailedLogin when counter is already 0', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser); // failedLoginAttempts: 0
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('token');

      await service.login('testuser', 'password');

      expect(usersService.resetFailedLogin).not.toHaveBeenCalled();
    });
  });

  describe('signAccessTokenForUserId', () => {
    it('signs a token and returns the public user for the given id', async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('rotated.jwt');

      const result = await service.signAccessTokenForUserId(mockUser.id);

      expect(usersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        username: mockUser.username,
        role: mockUser.role,
      });
      expect(result).toEqual({ access_token: 'rotated.jwt', user: mockUserPublic });
    });

    it('throws Unauthorized when the user no longer exists', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException('gone'));

      await expect(service.signAccessTokenForUserId('missing')).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
