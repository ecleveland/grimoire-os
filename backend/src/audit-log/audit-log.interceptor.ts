import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditAction } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from './audit-log.service';

// /api/srd is NOT blanket-excluded anymore: since VEG-293 it hosts genuine
// user-content mutations (homebrew monsters). Only the read-only-despite-POST
// print hydration stays excluded; SRD reads are GETs and never reach logging.
const EXCLUDED_PREFIXES = ['/api/auth', '/api/srd/cards', '/api/seed', '/api/docs'];

const METHOD_TO_ACTION: Record<string, AuditAction> = {
  POST: AuditAction.create,
  PATCH: AuditAction.update,
  PUT: AuditAction.update,
  DELETE: AuditAction.delete,
};

const ENTITY_MAP: Record<string, string> = {
  campaigns: 'Campaign',
  characters: 'Character',
  notes: 'Note',
  encounters: 'Encounter',
  users: 'User',
};

// User-mutable content types living under /srd/* (homebrew, VEG-293). Extend as
// VEG-294/295/296 add spells/feats/items CRUD.
const SRD_CONTENT_ENTITY_MAP: Record<string, string> = {
  monsters: 'Monster',
};

const SENSITIVE_KEYS = ['password', 'passwordHash', 'currentPassword', 'newPassword'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url, body, ip } = request;

    const action = METHOD_TO_ACTION[method];
    if (!action) return next.handle();

    if (EXCLUDED_PREFIXES.some(p => url.startsWith(p))) {
      return next.handle();
    }

    const { entity, entityId } = parseRoute(url);
    if (!entity) return next.handle();

    return next.handle().pipe(
      tap((responseBody: Record<string, unknown> | undefined) => {
        const user = request.user;
        if (!user) return;

        const createdId = responseBody?.id;
        const resolvedEntityId =
          entityId ??
          (action === AuditAction.create &&
          (typeof createdId === 'string' || typeof createdId === 'number') &&
          createdId
            ? String(createdId)
            : undefined);

        const metadata = sanitize(body);

        void this.auditLogService.log({
          userId: user.userId,
          username: user.username,
          action,
          entity,
          entityId: resolvedEntityId,
          metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
          ipAddress: ip,
        });
      })
    );
  }
}

function parseRoute(url: string): {
  entity: string | null;
  entityId: string | null;
} {
  const path = url.split('?')[0].replace(/^\/api\//, '');
  const segments = path.split('/').filter(Boolean);

  // Handle /admin/{entity}/:id pattern
  if (segments[0] === 'admin' && segments[1]) {
    const entity = ENTITY_MAP[segments[1]] ?? null;
    return { entity, entityId: segments[2] ?? null };
  }

  // Handle /srd/{contentType}/:id — homebrew content mutations (VEG-293)
  if (segments[0] === 'srd' && segments[1]) {
    const entity = SRD_CONTENT_ENTITY_MAP[segments[1]] ?? null;
    return { entity, entityId: segments[2] ?? null };
  }

  const entity = ENTITY_MAP[segments[0]] ?? null;
  if (!entity) return { entity: null, entityId: null };

  return { entity, entityId: segments[1] ?? null };
}

function sanitize(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const sanitized = { ...body };
  for (const key of SENSITIVE_KEYS) {
    if (key in sanitized) sanitized[key] = '[REDACTED]';
  }
  return sanitized;
}
