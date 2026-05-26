import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

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
