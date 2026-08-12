import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * End-to-end auth flow over HTTP: register (both account types), login, refresh
 * with rotation, logout, and the guard-protected /auth/me. Boots the whole app;
 * requires live Postgres + Redis (CI provides them).
 */
describe('Auth endpoints (register/login/refresh/logout)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  // Superuser client (bypasses RLS) used only to clean up seeded tenants.
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  const personEmail = `t011-person-${randomUUID()}@test.local`;
  const orgEmail = `t011-org-${randomUUID()}@test.local`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    // The password-reset request now writes an append-only audit_logs row (T-110),
    // whose immutability trigger blocks the org cascade DELETE (RNF04). Purge those
    // rows under replica mode first (shared teardown helper), then the cascade
    // removes users, credentials, refresh and reset tokens as before.
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('registers a Person and returns a valid session', async () => {
    const res = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Persona Uno', email: personEmail, password })
      .expect(201);

    expect(res.body.user.accountType).toBe('person');
    expect(res.body.user.email).toBe(personEmail);
    expect(res.body.user.organizationId).toEqual(expect.any(String));
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    expect(res.body.tokens.tokenType).toBe('Bearer');
    createdOrgIds.push(res.body.user.organizationId);
  });

  it('registers an Organization and returns a valid session', async () => {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Central',
        displayName: 'Owner',
        email: orgEmail,
        password,
      })
      .expect(201);

    expect(res.body.user.accountType).toBe('organization');
    createdOrgIds.push(res.body.user.organizationId);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Dup', email: personEmail, password })
      .expect(409);
  });

  it('rejects weak/invalid payloads with 400', async () => {
    await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'X', email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('logs in with correct credentials and issues access + refresh', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email: personEmail, password })
      .expect(200);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects login with a wrong password (401)', async () => {
    await request(server)
      .post('/auth/login')
      .send({ email: personEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('exposes the authenticated principal on /auth/me with the access token', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: personEmail, password })
      .expect(200);
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(personEmail);
    expect(me.body.accountType).toBe('person');
    // displayName is the real profile name (read from the DB), not the email.
    expect(me.body.displayName).toBe('Persona Uno');
    expect(me.body.displayName).not.toBe(personEmail);
  });

  it('rejects /auth/me without a token (401)', async () => {
    await request(server).get('/auth/me').expect(401);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: personEmail, password })
      .expect(200);
    const original = login.body.tokens.refreshToken;

    const rotated = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: original })
      .expect(200);
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).not.toBe(original);

    // The original refresh token no longer works after rotation.
    await request(server).post('/auth/refresh').send({ refreshToken: original }).expect(401);

    // Logout revokes the rotated token.
    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(204);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('accepts a password-reset request without revealing account existence (202)', async () => {
    await request(server).post('/auth/password-reset').send({ email: personEmail }).expect(202);
    await request(server)
      .post('/auth/password-reset')
      .send({ email: `missing-${randomUUID()}@test.local` })
      .expect(202);
  });

  describe('session persistence via the httpOnly refresh cookie (silent bootstrap)', () => {
    it('sets an httpOnly cookie on login and silently resumes the session with it alone', async () => {
      const agent = request.agent(server);
      const login = await agent
        .post('/auth/login')
        .send({ email: personEmail, password })
        .expect(200);

      const setCookie = login.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
      expect(cookieHeader).toMatch(/af_refresh=/);
      expect(cookieHeader).toMatch(/HttpOnly/i);

      // No refreshToken in the body at all — only the ambient cookie the agent
      // already holds from the login response above.
      const silent = await agent.post('/auth/refresh/silent').expect(200);
      expect(silent.body.accessToken).toEqual(expect.any(String));
      expect(silent.body.refreshToken).toEqual(expect.any(String));
      expect(silent.body.refreshToken).not.toBe(login.body.tokens.refreshToken);

      // Logout clears the cookie, so a later silent refresh finds nothing —
      // never an error, just the same "no session" shape as a first visit.
      await agent.post('/auth/logout').send({ refreshToken: silent.body.refreshToken }).expect(204);
      const afterLogout = await agent.post('/auth/refresh/silent').expect(200);
      expect(afterLogout.body).toBeNull();
    });

    it('resolves to null (never an error) when there is no refresh cookie at all', async () => {
      const res = await request(server).post('/auth/refresh/silent').expect(200);
      expect(res.body).toBeNull();
    });
  });
});
