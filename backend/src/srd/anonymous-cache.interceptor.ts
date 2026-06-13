import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
import type { OptionallyAuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';

/**
 * URL-keyed response cache that activates for **anonymous callers only** (VEG-333).
 *
 * The owner-aware SRD routes (monsters / spells / unified search) resolve the
 * global catalog plus the caller's own homebrew, so an authenticated response
 * varies per user and must never be shared. But for an anonymous caller
 * `visibleTo(undefined)` collapses to the global catalog, making the response
 * byte-identical across every visitor — yet it currently re-queries Postgres on
 * every request (the unified-search UNION ALL being the worst case).
 *
 * This interceptor caches those anonymous responses by URL with the module's
 * default TTL, while authenticated requests (identified by `req.user`, which the
 * `OptionalJwtAuthGuard` populates before interceptors run) bypass the cache
 * entirely — never reading a shared entry and never writing one. So a user's
 * homebrew can't leak into another response, and a caller always sees their own
 * writes immediately.
 */
@Injectable()
export class AnonymousCacheInterceptor extends CacheInterceptor {
  protected trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<OptionallyAuthenticatedRequest>();
    // Authenticated → no cache key → CacheInterceptor skips both read and write.
    if (request.user) {
      return undefined;
    }
    // Anonymous → fall back to the built-in GET-only, URL-keyed behavior.
    return super.trackBy(context) as string | undefined;
  }
}
