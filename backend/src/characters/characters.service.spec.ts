import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CharactersService } from './characters.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { createMockPrismaService, MockPrismaService } from '../test/prisma-mock.factory';
import {
  USER_ID,
  USER_ID_2,
  CHARACTER_ID,
  mockCharacter,
  createCharacterDto,
} from '../test/fixtures';
import { CharacterDto, CharacterListItemDto } from './dto/character-response.dto';

describe('CharactersService', () => {
  let service: CharactersService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignMember: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    campaignAuth = { assertCampaignMember: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignAuthService, useValue: campaignAuth },
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
      expect(result).toBeInstanceOf(CharacterDto);
    });

    it('does not check campaign membership when no campaignId is given', async () => {
      prisma.character.create.mockResolvedValue(mockCharacter);

      await service.create(USER_ID, createCharacterDto);

      expect(campaignAuth.assertCampaignMember).not.toHaveBeenCalled();
    });

    it('asserts campaign membership when campaignId is provided', async () => {
      const campaignId = '123e4567-e89b-42d3-a456-426614174000';
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: campaignId });
      prisma.character.create.mockResolvedValue({ ...mockCharacter, campaignId });

      await service.create(USER_ID, { ...createCharacterDto, campaignId });

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(campaignId, USER_ID);
      expect(prisma.character.create).toHaveBeenCalled();
    });

    it('rejects and does not create when the user is not a member of the target campaign', async () => {
      const campaignId = '123e4567-e89b-42d3-a456-426614174000';
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(
        service.create(USER_ID_2, { ...createCharacterDto, campaignId })
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.character.create).not.toHaveBeenCalled();
    });
  });

  describe('CreateCharacterDto validation', () => {
    it('rejects a non-UUID campaignId', async () => {
      const dto = plainToInstance(CreateCharacterDto, {
        ...createCharacterDto,
        campaignId: 'not-a-uuid',
      });

      const errors = await validate(dto);

      expect(errors.some(e => e.property === 'campaignId')).toBe(true);
    });

    it('accepts a UUID campaignId', async () => {
      const dto = plainToInstance(CreateCharacterDto, {
        ...createCharacterDto,
        campaignId: '123e4567-e89b-42d3-a456-426614174000',
      });

      const errors = await validate(dto);

      expect(errors.filter(e => e.property === 'campaignId')).toEqual([]);
    });
  });

  describe('findAllForUser', () => {
    it('should return paginated characters filtered by userId', async () => {
      prisma.character.findMany.mockResolvedValue([mockCharacter]);
      prisma.character.count.mockResolvedValue(1);

      const result = await service.findAllForUser(USER_ID, { page: 1, limit: 20 });

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        select: {
          id: true,
          userId: true,
          name: true,
          race: true,
          class: true,
          level: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.character.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result).toEqual({
        data: [
          {
            id: mockCharacter.id,
            userId: mockCharacter.userId,
            name: mockCharacter.name,
            race: mockCharacter.race,
            class: mockCharacter.class,
            level: mockCharacter.level,
            createdAt: mockCharacter.createdAt,
            updatedAt: mockCharacter.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      expect(result.data[0]).toBeInstanceOf(CharacterListItemDto);
      // Heavy columns never reach the list payload.
      expect((result.data[0] as unknown as Record<string, unknown>).abilityScores).toBeUndefined();
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

  describe('update with optimistic locking (expectedVersion)', () => {
    it('guards the write on expectedVersion, increments version, and returns the fresh row', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // findOneForUser ownership read
        .mockResolvedValueOnce({ ...mockCharacter, level: 6, version: 3 }); // post-write re-fetch
      prisma.character.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(CHARACTER_ID, USER_ID, {
        level: 6,
        expectedVersion: 2,
      });

      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID, version: 2 },
        data: { level: 6, version: { increment: 1 } },
      });
      // expectedVersion is a guard, never a persisted column.
      expect(prisma.character.update).not.toHaveBeenCalled();
      expect(result.level).toBe(6);
      expect(result.version).toBe(3);
    });

    it('throws 409 ConflictException carrying currentVersion on a stale write', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // ownership read
        .mockResolvedValueOnce({ ...mockCharacter, version: 5 }); // current-version probe
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      const err = await service
        .update(CHARACTER_ID, USER_ID, { level: 6, expectedVersion: 2 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ currentVersion: 5 });
    });

    it('throws NotFoundException when the row vanished mid-update', async () => {
      prisma.character.findUnique
        .mockResolvedValueOnce(mockCharacter) // ownership read
        .mockResolvedValueOnce(null); // probe: gone
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(CHARACTER_ID, USER_ID, { level: 6, expectedVersion: 2 })
      ).rejects.toThrow(NotFoundException);
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
