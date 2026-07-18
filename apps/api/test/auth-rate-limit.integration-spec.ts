import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Rate limiting on the auth endpoints. Uses its own app instance so the
 * throttler's in-memory counter is isolated from the other suites. The login
 * endpoint is limited to 5 requests / minute per IP; the 6th must be rejected
 * with HTTP 429 regardless of the (wrong) credentials.
 */
describe('Auth rate limiting', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const email = `ratelimit-${randomUUID()}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('blocks with 429 once the per-IP login budget is exceeded', async () => {
    // First 5 attempts are allowed through to the handler (401 wrong creds).
    for (let i = 0; i < 5; i += 1) {
      await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    }
    // The 6th within the window is throttled before reaching the handler.
    await request(server)
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(429);
  });
});
