import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/notifications/notification.port';
import { RemindersService } from '../src/modules/animals/reminders.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * M03 clinical reminders (RF09, T-106): the background worker generates in-app
 * reminders respecting the tenant (SECURITY DEFINER cross-tenant scan → withTenant
 * write), idempotently; the reminder persists even when the NotificationPort send
 * fails (→ Failed); RBAC for view/resolve; and no cross-org leak. The worker
 * logic is driven directly (no BullMQ timer); the NotificationPort is a
 * toggleable stub so we can simulate a send failure.
 */
describe('Clinical reminders (M03, RF09: worker + idempotency + RBAC + tenant)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let reminders: RemindersService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  // Toggleable NotificationPort stub (best-effort send).
  const notifier = {
    shouldFail: false,
    calls: 0,
    async send(): Promise<void> {
      notifier.calls += 1;
      if (notifier.shouldFail) {
        throw new Error('simulated notification failure');
      }
    },
  };

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Org',
        displayName: 'Owner',
        email: `t106-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const actor = await registerOrg();
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const createAnimal = (token: string) =>
    request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' });

  const addVaccine = (token: string, animalId: string, nextDueDate: string) =>
    request(server)
      .post(`/animals/${animalId}/clinical-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vaccine', occurredAt: '2026-01-01T00:00:00.000Z', nextDueDate });

  const listReminders = (token: string) =>
    request(server).get('/clinical-reminders').set('Authorization', `Bearer ${token}`);

  let vet: Actor;
  let animalId = '';
  let event1Id = '';
  let event2Id = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifier)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    reminders = app.get(RemindersService);

    vet = await actorWithRoles(['veterinarian']);
    const animal = await createAnimal(vet.token).expect(201);
    animalId = animal.body.id;
    // Overdue vaccine (past nextDueDate) → within any window.
    event1Id = (await addVaccine(vet.token, animalId, '2026-06-01T00:00:00.000Z').expect(201)).body
      .eventId;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('the worker generates exactly one reminder per due event, and re-scanning does not duplicate', async () => {
    await reminders.generateDue(30);
    await reminders.generateDue(30); // idempotent re-scan

    const res = await listReminders(vet.token).expect(200);
    const ours = res.body.filter(
      (r: { clinicalEventId: string }) => r.clinicalEventId === event1Id,
    );
    expect(ours).toHaveLength(1);
    expect(ours[0]).toMatchObject({ type: 'vaccine', status: 'pending', animalId });

    // Generation is audited (UTC) without clinical detail.
    const events = await admin.auditLog.findMany({
      where: { organizationId: vet.orgId, action: 'animal.reminder_generated' },
    });
    expect(events.length).toBe(1);
  });

  it('sends via the NotificationPort → status Sent', async () => {
    const res = await listReminders(vet.token).expect(200);
    const reminderId = res.body.find(
      (r: { clinicalEventId: string }) => r.clinicalEventId === event1Id,
    ).id;
    const before = notifier.calls;
    await reminders.send(reminderId, vet.orgId);
    expect(notifier.calls).toBe(before + 1); // port invoked

    const after = await listReminders(vet.token).expect(200);
    const sent = after.body.find((r: { id: string }) => r.id === reminderId);
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).toEqual(expect.any(String));
  });

  it('keeps the reminder in-app when the send fails (→ Failed) and signals a retry', async () => {
    // A second overdue vaccine → a second reminder.
    event2Id = (await addVaccine(vet.token, animalId, '2026-05-01T00:00:00.000Z').expect(201)).body
      .eventId;
    await reminders.generateDue(30);

    const res = await listReminders(vet.token).expect(200);
    const reminderId = res.body.find(
      (r: { clinicalEventId: string }) => r.clinicalEventId === event2Id,
    ).id;

    notifier.shouldFail = true;
    // The service throws so BullMQ would retry with the RNF07 backoff.
    await expect(reminders.send(reminderId, vet.orgId)).rejects.toThrow();
    notifier.shouldFail = false;

    const after = await listReminders(vet.token).expect(200);
    const failed = after.body.find((r: { id: string }) => r.id === reminderId);
    expect(failed.status).toBe('failed'); // persisted, still visible in-app
  });

  it('RBAC: view = auditor ✓ (200), person ✗ (403); resolve = auditor ✗ (403)', async () => {
    const res = await listReminders(vet.token).expect(200);
    const reminderId = res.body[0].id;

    const auditor = await actorWithRoles(['read_only_auditor']);
    await listReminders(auditor.token).expect(200); // may view
    await request(server)
      .post(`/clinical-reminders/${reminderId}/acknowledge`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(403); // may NOT resolve

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t106-person-${randomUUID()}@test.local`, password })
      .expect(201);
    createdOrgIds.push(personRes.body.user.organizationId);
    await listReminders(personRes.body.tokens.accessToken).expect(403); // no role → no view
  });

  it('Veterinarian can acknowledge a reminder', async () => {
    const res = await listReminders(vet.token).expect(200);
    const pending = res.body.find((r: { status: string }) => r.status !== 'acknowledged');
    const ack = await request(server)
      .post(`/clinical-reminders/${pending.id}/acknowledge`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(201);
    expect(ack.body.status).toBe('acknowledged');
    expect(ack.body.resolvedByUserId).toBe(vet.userId);
  });

  it('does not leak reminders across tenants (RLS), including worker-generated ones', async () => {
    const vetB = await actorWithRoles(['veterinarian']);
    const res = await listReminders(vetB.token).expect(200);
    expect(res.body.every((r: { organizationId: string }) => r.organizationId === vetB.orgId)).toBe(
      true,
    );
    expect(res.body.some((r: { clinicalEventId: string }) => r.clinicalEventId === event1Id)).toBe(
      false,
    );
  });
});
