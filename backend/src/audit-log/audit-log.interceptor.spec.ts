import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditAction } from '@prisma/client';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogService } from './audit-log.service';

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let auditLogService: { log: jest.Mock };

  beforeEach(() => {
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditLogInterceptor(auditLogService as unknown as AuditLogService);
  });

  function createContext(overrides: {
    method: string;
    url: string;
    body?: Record<string, unknown>;
    user?: { userId: string; username: string; role: string } | null;
    ip?: string;
  }): { context: ExecutionContext; next: CallHandler } {
    const request = {
      method: overrides.method,
      url: overrides.url,
      body: overrides.body ?? {},
      ip: overrides.ip ?? '127.0.0.1',
      user:
        overrides.user !== undefined
          ? overrides.user
          : {
              userId: 'user-1',
              username: 'testuser',
              role: 'player',
            },
    };

    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const next = {
      handle: () => of({ id: 'new-entity-id', name: 'Test' }),
    } as CallHandler;

    return { context, next };
  }

  it('logs create action for POST requests', done => {
    const { context, next } = createContext({
      method: 'POST',
      url: '/api/campaigns',
      body: { name: 'Test Campaign' },
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith({
        userId: 'user-1',
        username: 'testuser',
        action: AuditAction.create,
        entity: 'Campaign',
        entityId: 'new-entity-id',
        metadata: { name: 'Test Campaign' },
        ipAddress: '127.0.0.1',
      });
      done();
    });
  });

  it('logs update action for PATCH requests with entityId from URL', done => {
    const { context, next } = createContext({
      method: 'PATCH',
      url: '/api/characters/char-123',
      body: { name: 'Updated Name' },
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.update,
          entity: 'Character',
          entityId: 'char-123',
        })
      );
      done();
    });
  });

  it('logs delete action for DELETE requests', done => {
    const { context, next } = createContext({
      method: 'DELETE',
      url: '/api/notes/note-456',
    });

    const next2 = { handle: () => of(undefined) } as CallHandler;

    interceptor.intercept(context, next2).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.delete,
          entity: 'Note',
          entityId: 'note-456',
        })
      );
      done();
    });
  });

  it('skips GET requests', done => {
    const { context, next } = createContext({
      method: 'GET',
      url: '/api/campaigns',
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('skips auth routes', done => {
    const { context, next } = createContext({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'test', password: 'secret' },
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('skips SRD routes', done => {
    const { context, next } = createContext({
      method: 'POST',
      url: '/api/srd/spells',
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('skips seed routes', done => {
    const { context, next } = createContext({
      method: 'POST',
      url: '/api/seed',
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('redacts sensitive fields in metadata', done => {
    const { context, next } = createContext({
      method: 'PATCH',
      url: '/api/users/user-1',
      body: { displayName: 'New Name', password: 'secret123' },
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { displayName: 'New Name', password: '[REDACTED]' },
        })
      );
      done();
    });
  });

  it('skips logging when no user is present', done => {
    const { context, next } = createContext({
      method: 'POST',
      url: '/api/campaigns',
      user: null,
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('handles admin sub-routes correctly', done => {
    const { context, next } = createContext({
      method: 'PATCH',
      url: '/api/admin/users/user-456',
      body: { role: 'admin' },
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'User',
          entityId: 'user-456',
          action: AuditAction.update,
        })
      );
      done();
    });
  });

  it('omits metadata when body is empty', done => {
    const { context, next } = createContext({
      method: 'DELETE',
      url: '/api/encounters/enc-1',
      body: {},
    });

    const next2 = { handle: () => of(undefined) } as CallHandler;

    interceptor.intercept(context, next2).subscribe(() => {
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        })
      );
      done();
    });
  });
});
