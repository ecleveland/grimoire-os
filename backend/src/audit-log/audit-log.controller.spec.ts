import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: service }],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service with query params', async () => {
      const mockResult = { data: [], total: 0, page: 1, limit: 50 };
      service.findAll.mockResolvedValue(mockResult);

      const query = { entity: 'Campaign', action: AuditAction.create };
      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });
});
