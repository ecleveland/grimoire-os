import { INestApplication, Logger, ValidationPipeOptions } from '@nestjs/common';
import { ValidatorOptions } from 'class-validator';
import { Express, NextFunction, Response, json, urlencoded } from 'express';
import helmet, { HelmetOptions } from 'helmet';
import type { OptionallyAuthenticatedRequest } from './auth/interfaces/jwt-payload.interface';
import { LogFormat, resolveLogFormat } from './config/logging.config';
import { resolveTrustProxy } from './config/trust-proxy.config';

// Strictness shared by the global ValidationPipe and manual validateSync call
// sites (e.g. AdminNpcDataService, whose body class depends on a route param).
export const VALIDATOR_STRICTNESS: ValidatorOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
};

export const GLOBAL_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  ...VALIDATOR_STRICTNESS,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};

export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024; // 1MB
export const AUTH_BODY_LIMIT_BYTES = 100 * 1024; // 100KB

export const AUTH_LIMITED_PATHS = ['/api/auth/login', '/api/auth/register'] as const;

export function configureBodyParsers(app: INestApplication): void {
  // Route-specific limits run before the global limit so the tighter cap wins.
  for (const path of AUTH_LIMITED_PATHS) {
    app.use(path, json({ limit: AUTH_BODY_LIMIT_BYTES }));
    app.use(path, urlencoded({ extended: true, limit: AUTH_BODY_LIMIT_BYTES }));
  }
  app.use(json({ limit: DEFAULT_BODY_LIMIT_BYTES }));
  app.use(urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT_BYTES }));
}

/**
 * Sets Express's trust proxy option to a hop count, so req.ip is the client
 * address from X-Forwarded-For when the backend sits behind that many proxies.
 * RateLimitGuard keys on req.ip. At 0 the option stays off and req.ip is the
 * direct peer, which keeps a client from choosing its own key with a forged
 * header.
 */
export function configureTrustProxy(app: INestApplication, hops = resolveTrustProxy()): void {
  if (hops <= 0) return;
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', hops);
}

// HSTS covers the app's own host for 180 days. includeSubDomains stays off
// because the app is one host on an operator's domain and must not claim the
// rest of it. Browsers would otherwise refuse plain HTTP on every subdomain of
// an apex install.
export const HELMET_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: false,
  strictTransportSecurity: {
    maxAge: 15552000,
    includeSubDomains: false,
  },
};

export function configureSecurityHeaders(app: INestApplication): void {
  app.use(helmet(HELMET_OPTIONS));
}

// The compose healthcheck polls this every 10 s, and a line for each poll would
// bury the requests an operator is looking for.
export const UNLOGGED_PATHS: readonly string[] = ['/api/health'];

// Segment sequences that put a secret in everything after them. A campaign
// invite code in the join path admits anyone who reads it. Add a route by
// adding its sequence in lower case.
export const SECRET_PATH_SEGMENTS: readonly (readonly string[])[] = [['campaigns', 'join']];

/**
 * The path as the request line shows it, with everything after a secret
 * segment sequence replaced by [redacted]. The prefix stays as the client sent
 * it.
 *
 * Express routes paths case-insensitively, and a client can send repeated
 * slashes, ./ segments or an absolute-form target, so the scan compares
 * segments in lower case and skips empty and . segments. Anything after the
 * slash that ends the sequence counts as the secret, a lone dot included,
 * because redacting too much is the safe side.
 *
 * The middleware runs this on every request, so it is one pass over the path
 * with no regular expression, which keeps a long run of slashes from costing
 * more than its length.
 */
export function redactSecretPath(path: string): string {
  // Each meaningful segment in lower case, with the offset just past its end.
  const segments: { name: string; end: number }[] = [];
  let start = 0;
  for (let i = 0; i <= path.length; i++) {
    if (i < path.length && path[i] !== '/') continue;
    if (i > start) {
      const name = path.slice(start, i).toLowerCase();
      if (name !== '.') segments.push({ name, end: i });
    }
    start = i + 1;
  }

  for (let i = 0; i < segments.length; i++) {
    for (const sequence of SECRET_PATH_SEGMENTS) {
      if (!sequence.every((name, offset) => segments[i + offset]?.name === name)) continue;
      // The offset of the slash after the sequence's last segment.
      const slash = segments[i + sequence.length - 1].end;
      if (slash + 1 < path.length) return `${path.slice(0, slash + 1)}[redacted]`;
    }
  }
  return path;
}

/**
 * Logs one line per finished request at level log, with context HTTP. The line
 * has the method, the path without its query string, the status, the duration
 * in whole milliseconds and the user id when a guard signed the request in. It
 * leaves out the query string, because search text travels there, redacts the
 * invite code in a join path (see SECRET_PATH_SEGMENTS), and never reads the
 * body, headers, cookies or client address.
 *
 * Register it before every other middleware, so the duration covers them and
 * a response they end early, such as a 413 or a 401, still gets a line. The
 * user id is read when the response finishes, because the JWT guard sets
 * req.user after middleware has run.
 *
 * In JSON mode the fields also go to the logger as an object, which the app
 * logger prints as top-level keys. In text mode they appear only in the
 * message, because the text logger would print the object after it.
 */
export function configureRequestLogging(
  app: INestApplication,
  format: LogFormat = resolveLogFormat()
): void {
  const logger = new Logger('HTTP');
  app.use((req: OptionallyAuthenticatedRequest, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (UNLOGGED_PATHS.includes(path)) {
      next();
      return;
    }
    const loggedPath = redactSecretPath(path);
    const startedAt = performance.now();
    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const userId = req.user?.userId;
      const message =
        `${req.method} ${loggedPath} ${res.statusCode} ${durationMs}ms` +
        (userId ? ` user=${userId}` : '');
      if (format === 'json') {
        const fields = {
          method: req.method,
          path: loggedPath,
          status: res.statusCode,
          durationMs,
        };
        logger.log(message, userId ? { ...fields, userId } : fields);
      } else {
        logger.log(message);
      }
    });
    next();
  });
}
