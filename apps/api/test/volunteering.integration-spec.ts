import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M08 volunteering (RF18/RF19) end-to-end: publish an opportunity → public
 * listing → enroll → org accepts/rejects → log hours → org approves/rejects
 * → certificate gated by the RF19 student-service minimum, never reflecting
 * pending/rejected hours → RBAC + tenant isolation throughout.
 */
describe('Volunteering (M08, RF18/RF19)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `s6-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: `Voluntario ${tag}`,
        email: `s6-p-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  const publishOpportunity = (token: string, appliesToStudentService: boolean) =>
    request(server).post('/volunteer-opportunities').set('Authorization', `Bearer ${token}`).send({
      title: 'Jornada de esterilización',
      category: 'sterilizations',
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-30T00:00:00.000Z',
      location: 'Refugio Patitas',
      appliesToStudentService,
    });

  const enroll = (token: string, opportunityId: string) =>
    request(server)
      .post('/volunteer-enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ opportunityId });

  const decideEnrollment = (token: string, id: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/volunteer-enrollments/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const logHours = (token: string, body: Record<string, unknown>) =>
    request(server).post('/service-hours').set('Authorization', `Bearer ${token}`).send(body);

  const decideHours = (token: string, id: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/service-hours/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const issueCertificate = (token: string, enrollmentId: string) =>
    request(server)
      .post(`/volunteer-certificates/${enrollmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();

  let org: Actor;
  let otherOrg: Actor;
  let volunteer: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('Refugio Voluntariado');
    otherOrg = await registerOrg('Otro Refugio');
    volunteer = await registerPerson('a');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('publishes an opportunity and lists it publicly (general volunteering)', async () => {
    const created = await publishOpportunity(org.token, false).expect(201);
    expect(created.body.status).toBe('active');
    expect(created.body.appliesToStudentService).toBe(false);

    const orgProfile = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const slug = `s6-slug-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ slug })
      .expect(200);
    expect(orgProfile.body.id).toBe(org.orgId);

    const publicList = await request(server)
      .get(`/public/organizations/${slug}/volunteer-opportunities`)
      .expect(200);
    expect(publicList.body.items.some((o: { id: string }) => o.id === created.body.id)).toBe(true);

    // Also visible on the GLOBAL feed (all organizations), same pattern as
    // GET /public/campaigns.
    const globalList = await request(server).get('/public/volunteer-opportunities').expect(200);
    expect(globalList.body.items.some((o: { id: string }) => o.id === created.body.id)).toBe(true);
  });

  it('a person without a role cannot publish an opportunity (403)', async () => {
    await publishOpportunity(volunteer.token, false).expect(403);
  });

  it('full flow: enroll → accept → log hours → approve → issue certificate (general volunteering, no minimum)', async () => {
    const opportunity = await publishOpportunity(org.token, false).expect(201);
    const opportunityId = opportunity.body.id;

    const enrolled = await enroll(volunteer.token, opportunityId).expect(201);
    expect(enrolled.body.status).toBe('pending');
    expect(enrolled.body.appliesToStudentService).toBe(false);
    const enrollmentId = enrolled.body.id;

    // The org sees it in its queue.
    const queue = await request(server)
      .get('/volunteer-enrollments')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(queue.body.items.some((e: { id: string }) => e.id === enrollmentId)).toBe(true);

    // Reject with NO reason → 400 (mandatory reason).
    await decideEnrollment(org.token, enrollmentId, { decision: 'reject' }).expect(400);

    // Accept.
    const accepted = await decideEnrollment(org.token, enrollmentId, { decision: 'accept' }).expect(
      200,
    );
    expect(accepted.body.status).toBe('accepted');

    // Log hours.
    const hoursLogged = await logHours(volunteer.token, {
      enrollmentId,
      date: '2026-09-05T00:00:00.000Z',
      hours: 4,
      description: 'Apoyo logístico',
    }).expect(201);
    expect(hoursLogged.body.status).toBe('pending');

    // General volunteering: certificate CAN be issued even with 0 approved hours.
    const earlyCert = await issueCertificate(org.token, enrollmentId).expect(201);
    expect(earlyCert.body.totalApprovedHours).toBe(0);

    // Undo: that consumed the one-certificate-per-enrollment slot — verify a
    // second issuance attempt is rejected (never a silent re-issue).
    await issueCertificate(org.token, enrollmentId).expect(400);
  });

  it('RF19: a student-service enrollment is blocked below 80 approved hours, and unblocked once reached', async () => {
    const opportunity = await publishOpportunity(org.token, true).expect(201);
    const opportunityId = opportunity.body.id;

    const enrolled = await enroll(volunteer.token, opportunityId).expect(201);
    expect(enrolled.body.appliesToStudentService).toBe(true);
    const enrollmentId = enrolled.body.id;
    await decideEnrollment(org.token, enrollmentId, { decision: 'accept' }).expect(200);

    // Two approved sessions of 20h each — 40h total, below the 80h minimum.
    for (const date of ['2026-09-05T00:00:00.000Z', '2026-09-06T00:00:00.000Z']) {
      const logged = await logHours(volunteer.token, {
        enrollmentId,
        date,
        hours: 20,
        description: 'Jornada de apoyo',
      }).expect(201);
      // Reject hours with no reason → 400 (only exercised once).
      if (date === '2026-09-05T00:00:00.000Z') {
        await decideHours(org.token, logged.body.id, { decision: 'reject' }).expect(400);
      }
      await decideHours(org.token, logged.body.id, { decision: 'approve' }).expect(200);
    }

    // Only 40 approved hours — below the 80h minimum (RF19).
    const blocked = await issueCertificate(org.token, enrollmentId).expect(400);
    expect(blocked.body.message).toMatch(/faltan 40 horas/i);
    expect(blocked.body.message).toMatch(/Resolución 4210\/1996/);

    // Log a THIRD session, reject it — must NOT count toward the minimum.
    const rejectedHours = await logHours(volunteer.token, {
      enrollmentId,
      date: '2026-09-07T00:00:00.000Z',
      hours: 20,
      description: 'Sesión con datos inconsistentes',
    }).expect(201);
    await decideHours(org.token, rejectedHours.body.id, {
      decision: 'reject',
      reason: 'Fecha no coincide con el registro de asistencia',
    }).expect(200);
    // Still blocked — the rejected session must not have moved the needle.
    const stillBlocked = await issueCertificate(org.token, enrollmentId).expect(400);
    expect(stillBlocked.body.message).toMatch(/faltan 40 horas/i);

    // Log and approve TWO more sessions that reach the 80h minimum.
    for (const date of ['2026-09-08T00:00:00.000Z', '2026-09-09T00:00:00.000Z']) {
      const finalHours = await logHours(volunteer.token, {
        enrollmentId,
        date,
        hours: 20,
        description: 'Jornada final',
      }).expect(201);
      await decideHours(org.token, finalHours.body.id, { decision: 'approve' }).expect(200);
    }

    const issued = await issueCertificate(org.token, enrollmentId).expect(201);
    expect(issued.body.totalApprovedHours).toBe(80);
    expect(issued.body.appliesToStudentService).toBe(true);
    expect(issued.body.volunteerName).toBeTruthy();
    const certificateId = issued.body.id;

    // The volunteer can read their own certificate and download its PDF.
    const own = await request(server)
      .get(`/volunteer-certificates/${certificateId}`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(own.body.id).toBe(certificateId);

    const pdf = await request(server)
      .get(`/volunteer-certificates/${certificateId}/pdf`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(200);

    // "Mis certificados" shows it too.
    const mine = await request(server)
      .get('/volunteer-certificates/mine')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(mine.body.some((c: { id: string }) => c.id === certificateId)).toBe(true);

    // "Mis inscripciones"/"Mis horas" reflect the real state.
    const mineEnrollments = await request(server)
      .get('/volunteer-enrollments/mine')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    expect(mineEnrollments.body.find((e: { id: string }) => e.id === enrollmentId)?.status).toBe(
      'accepted',
    );

    const mineHours = await request(server)
      .get('/service-hours/mine')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(200);
    // 4 approved sessions (2 + 2, 20h each = 80h) + 1 rejected — never counted.
    expect(mineHours.body.filter((h: { status: string }) => h.status === 'approved')).toHaveLength(
      4,
    );
    expect(mineHours.body.filter((h: { status: string }) => h.status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('tenant isolation: another org cannot decide on this enrollment, read its certificate, or see it in its own queue', async () => {
    const opportunity = await publishOpportunity(org.token, false).expect(201);
    const enrolled = await enroll(volunteer.token, opportunity.body.id).expect(201);
    const enrollmentId = enrolled.body.id;

    await decideEnrollment(otherOrg.token, enrollmentId, { decision: 'accept' }).expect(404);

    const otherQueue = await request(server)
      .get('/volunteer-enrollments')
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .expect(200);
    expect(otherQueue.body.items.some((e: { id: string }) => e.id === enrollmentId)).toBe(false);

    await decideEnrollment(org.token, enrollmentId, { decision: 'accept' }).expect(200);
    const issued = await issueCertificate(org.token, enrollmentId).expect(201);

    // Another PERSON (not the volunteer, not the org) cannot read the certificate.
    const stranger = await registerPerson('stranger');
    await request(server)
      .get(`/volunteer-certificates/${issued.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
  });

  it('a volunteer cannot log hours against an enrollment that is not theirs or not yet accepted', async () => {
    const opportunity = await publishOpportunity(org.token, false).expect(201);
    const enrolled = await enroll(volunteer.token, opportunity.body.id).expect(201);

    // Still pending — hours rejected (400), not silently accepted.
    await logHours(volunteer.token, {
      enrollmentId: enrolled.body.id,
      date: '2026-09-05T00:00:00.000Z',
      hours: 2,
      description: 'Intento temprano',
    }).expect(400);

    const other = await registerPerson('other-volunteer');
    await decideEnrollment(org.token, enrolled.body.id, { decision: 'accept' }).expect(200);
    // A different person cannot log hours on someone else's enrollment.
    await logHours(other.token, {
      enrollmentId: enrolled.body.id,
      date: '2026-09-05T00:00:00.000Z',
      hours: 2,
      description: 'No es mi inscripción',
    }).expect(400);
  });
});
