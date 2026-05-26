import { Test } from '@nestjs/testing';
import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import {
  AUTH_BODY_LIMIT_BYTES,
  AUTH_LIMITED_PATHS,
  DEFAULT_BODY_LIMIT_BYTES,
  configureBodyParsers,
} from './bootstrap-config';

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
