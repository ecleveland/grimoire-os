import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CharactersService } from './characters.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
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
      providers: [CharactersService, { provide: PrismaService, useValue: prisma }],
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
    it('should return character when found', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      const result = await service.findOne(CHARACTER_ID);

      expect(prisma.character.findUnique).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
      });
      expect(result).toEqual(mockCharacter);
    });

    it('should throw NotFoundException when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.findOne(CHARACTER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneForUser', () => {
    it('should return character when user is owner', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      const result = await service.findOneForUser(CHARACTER_ID, USER_ID);

      expect(result).toEqual(mockCharacter);
    });

    it('should throw ForbiddenException when user does not own character', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.findOneForUser(CHARACTER_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
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

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.update(CHARACTER_ID, USER_ID_2, { level: 6 })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw NotFoundException when character does not exist', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.update(CHARACTER_ID, USER_ID, { level: 6 })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('UpdateCharacterDto mass assignment protection', () => {
    it('should reject campaignId as a non-whitelisted property', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        name: 'Test',
        campaignId: 'malicious-campaign-id',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const hasCampaignIdError = errors.some(e => e.property === 'campaignId');
      expect(hasCampaignIdError).toBe(true);
    });

    it('should allow legitimate character fields', async () => {
      const dto = plainToInstance(UpdateCharacterDto, {
        name: 'Updated Name',
        level: 10,
        race: 'Elf',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors).toHaveLength(0);
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

    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      prisma.character.findUnique.mockResolvedValue(mockCharacter);

      await expect(service.remove(CHARACTER_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when character does not exist', async () => {
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.remove(CHARACTER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
