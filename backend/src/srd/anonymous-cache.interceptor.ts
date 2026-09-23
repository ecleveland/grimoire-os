import { CacheInterceptor } from '@nestjs/cache-manager';
import { CallHandler, ExecutionContext, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
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
 * default TTL (24h), while authenticated requests (identified by `req.user`,
 * which the `OptionalJwtAuthGuard` populates before interceptors run) bypass the
 * cache entirely — never reading a shared entry and never writing one. So a
 * user's homebrew can't leak into another response, and a caller always sees
 * their own writes immediately.
 *
 * Staleness: like the SrdController cache it restores, there is no write-path
 * invalidation, so an admin edit to *shared*-tier (globally-visible) content
 * reaches anonymous viewers only after the entry's 24h TTL expires. That's the
 * accepted pre-VEG-293 behavior this ticket restores; authenticated callers
 * bypass the cache and see shared edits immediately.
 *
 * Proxies: the bypass above only keeps an authenticated response out of *this*
 * process's store. A reverse proxy in front of `/api/srd/*` sees an ordinary 200
 * on a bare URL and may store it, which would serve one user's homebrew to the
 * next anonymous visitor. `Cache-Control: private, no-store` on authenticated
 * responses is how that same rule is stated to anything downstream.
 *
 * Memory: entries are keyed by full URL, so the free-text `?q=` search surface
 * is unbounded in cardinality. The global store is an LRU-bounded CacheableMemory
 * (VEG-340, see config/cache.config.ts), so high-cardinality anonymous traffic
 * (e.g. a crawler) evicts the least-recently-used entry once the cap is hit
 * rather than accreting one 24h entry per distinct URL; the 24h TTL is the
 * secondary backstop.
 */
@Injectable()
export class AnonymousCacheInterceptor extends CacheInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    if (http.getRequest<OptionallyAuthenticatedRequest>().user) {
      http
        .getResponse<{ setHeader: (name: string, value: string) => void }>()
        .setHeader('Cache-Control', 'private, no-store');
      return next.handle();
    }
    return super.intercept(context, next);
  }

  // Unreached for an authenticated caller now that `intercept` returns first,
  // and kept so the bypass does not rest on that one override alone.
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
