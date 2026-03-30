import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { USER_ID, CAMPAIGN_ID, CHARACTER_ID } from '../test/fixtures';
import { Role } from '../common/enums';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let service: Record<string, jest.Mock>;

  const mockReq = {
    user: { userId: USER_ID, username: 'testuser', role: Role.PLAYER },
  } as AuthenticatedRequest;

  const mockCampaign = { id: CAMPAIGN_ID, name: 'Dragon Campaign', ownerId: USER_ID };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      generateInviteCode: jest.fn(),
      joinByInviteCode: jest.fn(),
      addCharacter: jest.fn(),
      removeCharacter: jest.fn(),
      removePlayer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: service }],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
  });

  describe('create', () => {
    it('delegates to service with userId and dto', async () => {
      const dto = { name: 'New Campaign' };
      service.create.mockResolvedValue(mockCampaign);

      const result = await controller.create(mockReq, dto as any);

      expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('findAll', () => {
    it('delegates to service with userId and pagination', async () => {
      const paginatedResult = { data: [mockCampaign], total: 1, page: 1, lastPage: 1 };
      service.findAllForUser.mockResolvedValue(paginatedResult);

      const pagination = { page: 1, limit: 20 };
      const result = await controller.findAll(mockReq, pagination);

      expect(service.findAllForUser).toHaveBeenCalledWith(USER_ID, pagination);
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('delegates to findOneForUser with id and userId', async () => {
      service.findOneForUser.mockResolvedValue(mockCampaign);

      const result = await controller.findOne(CAMPAIGN_ID, mockReq);

      expect(service.findOneForUser).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('update', () => {
    it('delegates to service with id, userId, and dto', async () => {
      const dto = { name: 'Updated' };
      service.update.mockResolvedValue({ ...mockCampaign, ...dto });

      const result = await controller.update(CAMPAIGN_ID, mockReq, dto as any);

      expect(service.update).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID, dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('delegates to service with id and userId', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove(CAMPAIGN_ID, mockReq);

      expect(service.remove).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
    });
  });

  describe('generateInviteCode', () => {
    it('returns invite code wrapped in object', async () => {
      service.generateInviteCode.mockResolvedValue('abc123');

      const result = await controller.generateInviteCode(CAMPAIGN_ID, mockReq);

      expect(service.generateInviteCode).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual({ inviteCode: 'abc123' });
    });
  });

  describe('joinByInviteCode', () => {
    it('delegates to service with code and userId', async () => {
      service.joinByInviteCode.mockResolvedValue(mockCampaign);

      const result = await controller.joinByInviteCode('abc123', mockReq);

      expect(service.joinByInviteCode).toHaveBeenCalledWith('abc123', USER_ID);
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('addCharacter', () => {
    it('delegates to service with campaignId, characterId, and userId', async () => {
      service.addCharacter.mockResolvedValue(mockCampaign);

      const result = await controller.addCharacter(CAMPAIGN_ID, CHARACTER_ID, mockReq);

      expect(service.addCharacter).toHaveBeenCalledWith(CAMPAIGN_ID, CHARACTER_ID, USER_ID);
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('removeCharacter', () => {
    it('delegates to service with campaignId, characterId, and userId', async () => {
      service.removeCharacter.mockResolvedValue(undefined);

      await controller.removeCharacter(CAMPAIGN_ID, CHARACTER_ID, mockReq);

      expect(service.removeCharacter).toHaveBeenCalledWith(CAMPAIGN_ID, CHARACTER_ID, USER_ID);
    });
  });

  describe('removePlayer', () => {
    it('delegates to service with campaignId, playerId, and userId', async () => {
      const playerId = 'player-to-remove';
      service.removePlayer.mockResolvedValue(undefined);

      await controller.removePlayer(CAMPAIGN_ID, playerId, mockReq);

      expect(service.removePlayer).toHaveBeenCalledWith(CAMPAIGN_ID, playerId, USER_ID);
    });
  });
});
