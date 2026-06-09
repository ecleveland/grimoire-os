import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { Role } from '../common/enums';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UserDto } from './dto/user-response.dto';
import { toDto, toDtoArray } from '../common/serialization/to-dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(createUserDto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: {
          username: createUserDto.username,
          passwordHash,
          displayName: createUserDto.displayName ?? createUserDto.username,
          email: createUserDto.email,
          avatarUrl: createUserDto.avatarUrl,
          role: createUserDto.role ?? Role.PLAYER,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username or email already exists');
      }
      throw error;
    }
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        omit: { passwordHash: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return buildPaginatedResponse(toDtoArray(UserDto, data), total, page, limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  async findOnePublic(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return toDto(UserDto, user);
  }

  async findByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email },
    });
  }

  async update(id: string, updateDto: UpdateUserDto | AdminUpdateUserDto) {
    // A role change alters what the user's JWTs are allowed to do, so any
    // outstanding refresh tokens must die with the old role (VEG-317).
    const roleChanged = 'role' in updateDto && updateDto.role !== undefined;
    try {
      const user = await this.prisma.$transaction(async tx => {
        const updated = await tx.user.update({
          where: { id },
          data: updateDto,
          omit: { passwordHash: true },
        });
        if (roleChanged) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return updated;
      });
      return toDto(UserDto, user);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with ID "${id}" not found`);
      }
      throw error;
    }
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findOne(id);
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Revoke every live refresh token alongside the hash rewrite: a stolen
    // refresh cookie must not survive the victim changing their password.
    await this.prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  static readonly MAX_FAILED_ATTEMPTS = 5;
  static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000;

  async recordFailedLogin(userId: string, currentAttempts: number): Promise<void> {
    const data: Record<string, unknown> = { failedLoginAttempts: { increment: 1 } };
    if (currentAttempts + 1 >= UsersService.MAX_FAILED_ATTEMPTS) {
      data.lockoutUntil = new Date(Date.now() + UsersService.LOCKOUT_DURATION_MS);
    }
    await this.prisma.user.update({ where: { id: userId }, data });
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockoutUntil: null },
    });
  }

  async remove(id: string): Promise<void> {
    try {
      // Homebrew content dies with its author; admin-published `shared`
      // content survives via the SET NULL FK. The explicit deletes are
      // required because a homebrew row with a nulled creator would violate
      // the DB CHECK constraint and abort the user delete (VEG-317).
      await this.prisma.$transaction(async tx => {
        const homebrewByUser = {
          where: { createdById: id, contentSource: 'homebrew' as const },
        };
        await tx.spell.deleteMany(homebrewByUser);
        await tx.monster.deleteMany(homebrewByUser);
        await tx.item.deleteMany(homebrewByUser);
        await tx.feat.deleteMany(homebrewByUser);
        await tx.user.delete({ where: { id } });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with ID "${id}" not found`);
      }
      throw error;
    }
  }
}
