import { stripVTControlCharacters } from 'node:util';
import { Test } from '@nestjs/testing';
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import request from 'supertest';
import {
  AUTH_BODY_LIMIT_BYTES,
  AUTH_LIMITED_PATHS,
  DEFAULT_BODY_LIMIT_BYTES,
  configureBodyParsers,
  configureRequestLogging,
  configureSecurityHeaders,
  configureTrustProxy,
} from './bootstrap-config';
import { createAppLogger } from './config/logging.config';
import type { LogFormat } from './config/logging.config';

@Controller()
class TestController {
  @Post('api/echo')
  echo() {
    return { ok: true };
  }

  @Post('api/auth/login')
  login(@Body() body: Record<string, unknown>) {
    return { ok: true, hasBody: Object.keys(body).length > 0 };
  }

  @Post('api/auth/register')
  register() {
    return { ok: true };
  }
}

describe('configureBodyParsers', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParsers(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes byte-valued limits with auth tighter than default', () => {
    expect(AUTH_BODY_LIMIT_BYTES).toBeLessThan(DEFAULT_BODY_LIMIT_BYTES);
    expect(AUTH_LIMITED_PATHS).toEqual(
      expect.arrayContaining(['/api/auth/login', '/api/auth/register'])
    );
  });

  it('accepts an auth payload comfortably under the auth limit', async () => {
    const payload = { username: 'alice', password: 'correct horse battery staple' };

    const res = await request(app.getHttpServer()).post('/api/auth/login').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, hasBody: true });
  });

  it('rejects an auth login payload that exceeds the 100KB limit with 413', async () => {
    const oversized = { data: 'x'.repeat(AUTH_BODY_LIMIT_BYTES + 1024) };

    const res = await request(app.getHttpServer()).post('/api/auth/login').send(oversized);

    expect(res.status).toBe(413);
  });

  it('rejects an auth register payload that exceeds the 100KB limit with 413', async () => {
    const oversized = { data: 'x'.repeat(AUTH_BODY_LIMIT_BYTES + 1024) };

    const res = await request(app.getHttpServer()).post('/api/auth/register').send(oversized);

    expect(res.status).toBe(413);
  });

  it('accepts a non-auth payload between the auth limit and the default limit', async () => {
    // 500KB — over the 100KB auth cap, under the 1MB default cap
    const midSized = { data: 'x'.repeat(500 * 1024) };

    const res = await request(app.getHttpServer()).post('/api/echo').send(midSized);

    expect(res.status).toBe(201);
  });

  it('rejects a non-auth payload that exceeds the 1MB default limit with 413', async () => {
    const oversized = { data: 'x'.repeat(DEFAULT_BODY_LIMIT_BYTES + 16 * 1024) };

    const res = await request(app.getHttpServer()).post('/api/echo').send(oversized);

    expect(res.status).toBe(413);
  });
});

@Controller()
class IpController {
  @Get('api/ip')
  ip(@Req() req: Request) {
    return { ip: req.ip };
  }
}

describe('configureTrustProxy', () => {
  let app: INestApplication;

  async function start(hops: number) {
    const moduleRef = await Test.createTestingModule({
      controllers: [IpController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureTrustProxy(app, hops);
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  it('ignores X-Forwarded-For at 0 hops, so a client cannot pick its own rate-limit key', async () => {
    await start(0);

    const res = await request(app.getHttpServer())
      .get('/api/ip')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).not.toBe('203.0.113.7');
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('reads the client address from X-Forwarded-For at 1 hop', async () => {
    await start(1);

    const res = await request(app.getHttpServer())
      .get('/api/ip')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
  });

  it('trusts only the given number of hops from the right of X-Forwarded-For', async () => {
    await start(1);

    const res = await request(app.getHttpServer())
      .get('/api/ip')
      .set('X-Forwarded-For', '198.51.100.9, 203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
  });
});

describe('configureSecurityHeaders', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IpController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureSecurityHeaders(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends HSTS for the app host alone, without includeSubDomains', async () => {
    const res = await request(app.getHttpServer()).get('/api/ip');

    expect(res.headers['strict-transport-security']).toBe('max-age=15552000');
  });

  it('sends no Content-Security-Policy header', async () => {
    const res = await request(app.getHttpServer()).get('/api/ip');

    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});

// Sets req.user the way the JWT guard does, after every middleware has run, so
// a passing test proves the request line reads the user at response time.
class SignedInGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      userId: 'user-42',
      username: 'alice',
      role: 'player',
    };
    return true;
  }
}

class RejectingGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller('api')
class LoggedController {
  @Get('campaigns')
  campaigns() {
    return [];
  }

  @Post('campaigns')
  create(@Body() body: Record<string, unknown>) {
    return { received: Object.keys(body).length };
  }

  @Get('me')
  @UseGuards(SignedInGuard)
  me() {
    return { ok: true };
  }

  @Get('locked')
  @UseGuards(RejectingGuard)
  locked() {
    return { ok: true };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

describe('configureRequestLogging', () => {
  let app: INestApplication;
  let written: string[];
  let writeSpy: jest.SpyInstance;

  // Boots the way main.ts does, with the app logger built from the given env,
  // and captures every line the logger prints.
  async function start(env: Partial<Record<'LOG_FORMAT' | 'LOG_LEVEL', string>> = {}) {
    const moduleRef = await Test.createTestingModule({
      controllers: [LoggedController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: createAppLogger(env) });
    configureRequestLogging(app, (env.LOG_FORMAT ?? 'text') as LogFormat);
    await app.init();
  }

  function requestLines(): string[] {
    return written
      .map(line => stripVTControlCharacters(line))
      .filter(line => line.includes('[HTTP] ') || line.includes('"context":"HTTP"'));
  }

  function textMessages(): string[] {
    return requestLines().map(line =>
      line.slice(line.indexOf('[HTTP] ') + '[HTTP] '.length).trim()
    );
  }

  function jsonRecords(): Record<string, unknown>[] {
    return requestLines().map(line => JSON.parse(line) as Record<string, unknown>);
  }

  // The line is written on the response's finish event, which can land a tick
  // after the client has read the response.
  async function waitForRequestLines(count: number): Promise<void> {
    for (let i = 0; i < 50 && requestLines().length < count; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  beforeEach(() => {
    written = [];
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    await app.close();
    writeSpy.mockRestore();
  });

  it('logs method, path, status and whole-millisecond duration for a request (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/campaigns').expect(200);
    await waitForRequestLines(1);

    expect(textMessages()).toHaveLength(1);
    expect(textMessages()[0]).toMatch(/^GET \/api\/campaigns 200 \d+ms$/);
  });

  it('drops the query string from the logged path (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/campaigns?q=secret-search&code=invite-123');
    await waitForRequestLines(1);

    expect(textMessages()[0]).toMatch(/^GET \/api\/campaigns 200 \d+ms$/);
    expect(written.join('')).not.toContain('secret-search');
    expect(written.join('')).not.toContain('invite-123');
  });

  it('adds the user id when a guard signed the request in (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/me').expect(200);
    await waitForRequestLines(1);

    expect(textMessages()[0]).toMatch(/^GET \/api\/me 200 \d+ms user=user-42$/);
  });

  it('logs a request a guard rejects with 401, without a user (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/locked').expect(401);
    await waitForRequestLines(1);

    expect(textMessages()[0]).toMatch(/^GET \/api\/locked 401 \d+ms$/);
  });

  it('logs a request for an unknown route with 404 (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/nowhere').expect(404);
    await waitForRequestLines(1);

    expect(textMessages()[0]).toMatch(/^GET \/api\/nowhere 404 \d+ms$/);
  });

  it('never logs the request body or headers (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', 'access_token=cookie-value')
      .set('X-Custom', 'header-value')
      .send({ password: 'body-value' })
      .expect(201);
    await waitForRequestLines(1);

    expect(textMessages()[0]).toMatch(/^POST \/api\/campaigns 201 \d+ms$/);
    const output = written.join('');
    expect(output).not.toContain('cookie-value');
    expect(output).not.toContain('header-value');
    expect(output).not.toContain('body-value');
  });

  it('skips /api/health, which the container healthcheck polls (VEG-694)', async () => {
    await start();

    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/health?probe=1').expect(200);
    await request(app.getHttpServer()).get('/api/campaigns').expect(200);
    await waitForRequestLines(1);
    // Give a stray health line the same chance to land as the campaigns line.
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(textMessages()).toEqual([expect.stringMatching(/^GET \/api\/campaigns 200/)]);
  });

  it('prints request lines with fields as top-level JSON keys when LOG_FORMAT=json (VEG-694)', async () => {
    await start({ LOG_FORMAT: 'json' });

    await request(app.getHttpServer()).get('/api/me?q=secret').expect(200);
    await request(app.getHttpServer()).get('/api/campaigns').expect(200);
    await waitForRequestLines(2);

    const [signedIn, anonymous] = jsonRecords();
    expect(signedIn).toEqual(
      expect.objectContaining({
        level: 'log',
        context: 'HTTP',
        method: 'GET',
        path: '/api/me',
        status: 200,
        userId: 'user-42',
      })
    );
    expect(signedIn.message).toMatch(/^GET \/api\/me 200 \d+ms user=user-42$/);
    expect(Number.isInteger(signedIn.durationMs)).toBe(true);
    expect(signedIn.durationMs).toBeGreaterThanOrEqual(0);
    expect(anonymous).toEqual(
      expect.objectContaining({ method: 'GET', path: '/api/campaigns', status: 200 })
    );
    expect(anonymous).not.toHaveProperty('userId');
  });

  it('prints no request lines when LOG_LEVEL=warn (VEG-694)', async () => {
    await start({ LOG_LEVEL: 'warn' });

    await request(app.getHttpServer()).get('/api/campaigns').expect(200);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(requestLines()).toEqual([]);
  });
});
