import { Test, TestingModule } from '@nestjs/testing';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import type { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { USER_ID, CAMPAIGN_ID } from '../test/fixtures';
import { Role } from '../common/enums';

describe('NotesController', () => {
  let controller: NotesController;
  let service: Record<string, jest.Mock>;

  const mockReq = {
    user: { userId: USER_ID, username: 'testuser', role: Role.PLAYER },
  } as AuthenticatedRequest;

  const mockNote = {
    id: 'note-1',
    title: 'Session Log',
    campaignId: CAMPAIGN_ID,
    authorId: USER_ID,
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAllForCampaign: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: NotesService, useValue: service }],
    }).compile();

    controller = module.get<NotesController>(NotesController);
  });

  describe('create', () => {
    it('delegates to service with userId and dto', async () => {
      const dto = { title: 'Session Log', campaignId: CAMPAIGN_ID, content: 'We fought a dragon.' };
      service.create.mockResolvedValue(mockNote);

      const result = await controller.create(mockReq, dto as any);

      expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
      expect(result).toEqual(mockNote);
    });
  });

  describe('findAll', () => {
    it('delegates to service with campaignId, userId, and query', async () => {
      const query = { campaignId: CAMPAIGN_ID, page: 1, limit: 20 };
      const paginated = { data: [mockNote], total: 1, page: 1, lastPage: 1 };
      service.findAllForCampaign.mockResolvedValue(paginated);

      const result = await controller.findAll(query as any, mockReq);

      expect(service.findAllForCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID, query);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('delegates to service with id and userId', async () => {
      service.findOne.mockResolvedValue(mockNote);

      const result = await controller.findOne('note-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('note-1', USER_ID);
      expect(result).toEqual(mockNote);
    });
  });

  describe('update', () => {
    it('delegates to service with id, userId, and dto', async () => {
      const dto = { title: 'Updated Log' };
      service.update.mockResolvedValue({ ...mockNote, ...dto });

      const result = await controller.update('note-1', mockReq, dto as any);

      expect(service.update).toHaveBeenCalledWith('note-1', USER_ID, dto);
      expect(result.title).toBe('Updated Log');
    });
  });

  describe('remove', () => {
    it('delegates to service with id and userId', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('note-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('note-1', USER_ID);
    });
  });
});
