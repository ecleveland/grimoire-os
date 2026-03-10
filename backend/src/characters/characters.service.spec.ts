import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../test/prisma-mock.factory';
import {
  USER_ID,
  USER_ID_2,
  CHARACTER_ID,
  mockCharacter,
  createCharacterDto,
} from '../test/fixtures';

describe('CharactersService', () => {
  let service: CharactersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CharactersService>(CharactersService);
  });

  describe('create', () => {
    it('should create a character with userId', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

      const result = await service.create(USER_ID, createCharacterDto);

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: {
          ...createCharacterDto,
          userId: USER_ID,
        },
      });
      expect(result).toEqual(mockCharacter);
    });
  });

  describe('findAllForUser', () => {
    it('should return characters filtered by userId', async () => {
      prisma.character.findMany.mockResolvedValue([mockCharacter]);

      const result = await service.findAllForUser(USER_ID);

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual([mockCharacter]);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.findOne(CHARACTER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOneForUser', () => {
    it('should throw ForbiddenException when user does not own character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(
        service.findOneForUser(CHARACTER_ID, USER_ID_2),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should verify ownership then update the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      const updated = { ...mockCharacter, level: 6 };
      prisma.character.update.mockResolvedValue(updated);

      const result = await service.update(CHARACTER_ID, USER_ID, { level: 6 });

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { level: 6 },
      });
      expect(result.level).toBe(6);
    });
  });

  describe('remove', () => {
    it('should verify ownership then delete the character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);
      prisma.character.delete.mockResolvedValue(mockCharacter);

      await service.remove(CHARACTER_ID, USER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
      expect(prisma.character.delete).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
    });
  });
});
