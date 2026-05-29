import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../../auth/auth-cookie.config';

const THROTTLER_LIMIT_METADATA = 'THROTTLER:LIMIT';
const DEFAULT_THROTTLER_NAME = 'default';

// Anonymous clients (identified by IP) get a low-by-default bucket so a single
// unauthenticated attacker can't burn through capacity. Authenticated users get
// a higher ceiling because they're rate-limited per user id, which makes abuse
// trivially attributable. Both knobs are env-tunable so prod ops can dial them.
const DEFAULT_ANON_LIMIT = 30;
const DEFAULT_AUTHED_LIMIT = 120;

const REQUEST_USER_ID_CACHE = Symbol('rateLimitUserIdCache');

interface RateLimitedRequest extends Request {
  [REQUEST_USER_ID_CACHE]?: { value: string | null };
}

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly anonLimit: number;
  private readonly authedLimit: number;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService
  ) {
    super(options, storageService, reflector);
    this.anonLimit = readEnvInt(process.env.THROTTLE_ANON_LIMIT, DEFAULT_ANON_LIMIT);
    this.authedLimit = readEnvInt(process.env.THROTTLE_AUTHED_LIMIT, DEFAULT_AUTHED_LIMIT);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const typedReq = req as unknown as RateLimitedRequest;
    const userId = this.userIdFromRequest(typedReq);
    if (userId) return `user:${userId}`;
    const ip = typedReq.ip;
    return `ip:${ip && ip.length > 0 ? ip : 'unknown'}`;
  }

  // The base guard treats `limit` as the value resolved before handleRequest
  // runs. We swap it here so the *effective* limit depends on whether the
  // caller is authenticated — without losing per-route @Throttle overrides.
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== DEFAULT_THROTTLER_NAME) {
      return super.handleRequest(requestProps);
    }

    const handler = requestProps.context.getHandler();
    const classRef = requestProps.context.getClass();
    const routeLimitOverride = this.reflector.getAllAndOverride<unknown>(
      `${THROTTLER_LIMIT_METADATA}${DEFAULT_THROTTLER_NAME}`,
      [handler, classRef]
    );
    if (routeLimitOverride !== undefined && routeLimitOverride !== null) {
      return super.handleRequest(requestProps);
    }

    const { req } = this.getRequestResponse(requestProps.context);
    const isAuthed = this.userIdFromRequest(req as unknown as RateLimitedRequest) !== null;
    const effectiveLimit = isAuthed ? this.authedLimit : this.anonLimit;

    return super.handleRequest({ ...requestProps, limit: effectiveLimit });
  }

  private userIdFromRequest(req: RateLimitedRequest): string | null {
    const cached = req[REQUEST_USER_ID_CACHE];
    if (cached) return cached.value;
    const token = extractToken(req);
    let userId: string | null = null;
    if (token) {
      try {
        const payload = this.jwtService.verify<{ sub?: string }>(token);
        userId = typeof payload?.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
      } catch {
        userId = null;
      }
    }
    req[REQUEST_USER_ID_CACHE] = { value: userId };
    return userId;
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

function readEnvInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
