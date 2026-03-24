import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID } from '../test/fixtures';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, prismaMockProvider()],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    const entry = {
      userId: USER_ID,
      username: 'testuser',
      action: AuditAction.create,
      entity: 'Campaign',
      entityId: 'some-uuid',
      metadata: { name: 'Test Campaign' },
      ipAddress: '127.0.0.1',
    };

    it('creates an audit log record', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'log-1', ...entry });

      await service.log(entry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: entry.userId,
          username: entry.username,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
        },
      });
    });

    it('swallows errors without throwing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      prisma.auditLog.create.mockRejectedValue(new Error('DB down'));

      await expect(service.log(entry)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Audit log write failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    const mockLogs = [
      {
        id: 'log-1',
        userId: USER_ID,
        username: 'testuser',
        action: AuditAction.create,
        entity: 'Campaign',
        entityId: 'c1',
        metadata: null,
        ipAddress: '127.0.0.1',
        createdAt: new Date(),
      },
    ];

    it('returns paginated results with no filters', async () => {
      prisma.auditLog.findMany.mockResolvedValue(mockLogs);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({ data: mockLogs, total: 1, page: 1, limit: 50 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
      });
    });

    it('applies userId filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: USER_ID });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
        })
      );
    });

    it('applies entity and action filters', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        entity: 'Campaign',
        action: AuditAction.update,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'Campaign', action: AuditAction.update },
        })
      );
    });

    it('applies date range filters', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: new Date('2026-01-01T00:00:00Z'),
              lte: new Date('2026-12-31T23:59:59Z'),
            },
          },
        })
      );
    });

    it('respects page and limit parameters', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(100);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(result).toEqual({ data: [], total: 100, page: 3, limit: 10 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });
  });
});
