import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@Injectable()
export class CharactersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCharacterDto) {
    return this.prisma.character.create({
      data: {
        ...(dto as any),
        userId,
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.character.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) {
      throw new NotFoundException(`Character "${id}" not found`);
    }
    return character;
  }

  async findOneForUser(id: string, userId: string) {
    const character = await this.findOne(id);
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    return character;
  }

  async update(id: string, userId: string, dto: UpdateCharacterDto) {
    await this.findOneForUser(id, userId);
    return this.prisma.character.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneForUser(id, userId);
    await this.prisma.character.delete({ where: { id } });
  }
}
