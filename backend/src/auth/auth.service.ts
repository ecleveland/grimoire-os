import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async login(
    username: string,
    password: string
  ): Promise<{ access_token: string; user: PublicUser }> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Please try again later.');
    }

    if (user.lockoutUntil && user.lockoutUntil <= new Date()) {
      await this.usersService.resetFailedLogin(user.id);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await this.usersService.recordFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0) {
      await this.usersService.resetFailedLogin(user.id);
    }

    return {
      access_token: this.signAccessToken(user),
      user: this.toPublicUser(user),
    };
  }

  // Used by /auth/refresh: the refresh-token table's userId is authoritative;
  // here we just need the user's current username + role to mint a new JWT
  // payload. Treat a missing user as Unauthorized (account deleted mid-session).
  async signAccessTokenForUserId(
    userId: string
  ): Promise<{ access_token: string; user: PublicUser }> {
    try {
      const user = await this.usersService.findOne(userId);
      return {
        access_token: this.signAccessToken(user),
        user: this.toPublicUser(user),
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new UnauthorizedException('User no longer exists');
      }
      throw err;
    }
  }

  private signAccessToken(user: { id: string; username: string; role: string }): string {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
  }

  private toPublicUser(user: UserRow): PublicUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
