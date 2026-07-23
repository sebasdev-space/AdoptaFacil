import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClinicalReminder as ReminderRow } from '@prisma/client';
import {
  type ClinicalReminder,
  type ReminderResolution,
  ReminderStatus,
  type ReminderType,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { canResolve, statusForResolution } from './reminders.window';

/** Row returned by the SECURITY DEFINER cross-tenant due scan. */
interface DueRow {
  organization_id: string;
  animal_id: string;
  clinical_event_id: string;
  due_date: Date;
  event_type: string;
}

/** A reminder created this run — enough for the worker to enqueue a send job. */
export interface CreatedReminder {
  reminderId: string;
  organizationId: string;
}

function toReminder(row: ReminderRow): ClinicalReminder {
  return {
    id: row.id,
    organizationId: row.organizationId,
    animalId: row.animalId,
    clinicalEventId: row.clinicalEventId,
    type: row.reminderType as ReminderType,
    dueDate: row.dueDate.toISOString(),
    status: row.status as ReminderStatus,
    channel: row.channel ?? undefined,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
    resolvedByUserId: row.resolvedByUserId ?? undefined,
  };
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Generate in-app reminders for clinical events due within the window. Runs
   * WITHOUT a tenant context (background worker): the cross-tenant scan uses the
   * bounded SECURITY DEFINER function, then each reminder is created UNDER its
   * org's tenant context (withOrgContext) so the INSERT passes RLS. IDEMPOTENT —
   * an existing (event, dueDate, type) reminder is left untouched (no duplicate,
   * no duplicate audit). Returns only the reminders created THIS run.
   */
  async generateDue(windowDays?: number): Promise<CreatedReminder[]> {
    const days = windowDays ?? this.config.get('REMINDERS_WINDOW_DAYS', { infer: true });
    const rows = await this.prisma.$queryRaw<
      DueRow[]
    >`SELECT * FROM clinical_reminders_due(${days}::int)`;

    const created: CreatedReminder[] = [];
    for (const row of rows) {
      const reminder = await this.prisma.withOrgContext(row.organization_id, async (tx) => {
        const existing = await tx.clinicalReminder.findUnique({
          where: {
            clinicalEventId_dueDate_reminderType: {
              clinicalEventId: row.clinical_event_id,
              dueDate: row.due_date,
              reminderType: row.event_type,
            },
          },
        });
        if (existing) {
          return null; // idempotent: already generated
        }
        const inserted = await tx.clinicalReminder.create({
          data: {
            organizationId: row.organization_id,
            animalId: row.animal_id,
            clinicalEventId: row.clinical_event_id,
            reminderType: row.event_type,
            dueDate: row.due_date,
            status: ReminderStatus.Pending,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId: row.organization_id,
          actorUserId: null,
          action: 'animal.reminder_generated',
          entityType: 'clinical_reminder',
          entityId: inserted.id,
          // Only ids + type — never clinical detail.
          metadata: { type: row.event_type, clinicalEventId: row.clinical_event_id },
        });
        return inserted;
      });
      if (reminder) {
        created.push({ reminderId: reminder.id, organizationId: reminder.organizationId });
      }
    }
    return created;
  }

  /**
   * Attempt to notify for a reminder (best-effort). Success → Sent; failure →
   * Failed (the reminder PERSISTS and stays visible) and this method THROWS so
   * BullMQ retries with the RNF07 backoff. The NotificationPort call happens
   * OUTSIDE the DB transaction so a failure never rolls back the status write.
   */
  async send(reminderId: string, organizationId: string): Promise<void> {
    const reminder = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.clinicalReminder.findUnique({ where: { id: reminderId } }),
    );
    if (!reminder) {
      return; // nothing to do (e.g. purged)
    }
    if (
      reminder.status === ReminderStatus.Acknowledged ||
      reminder.status === ReminderStatus.Dismissed
    ) {
      return; // already resolved by a user; do not notify
    }

    let ok = true;
    try {
      await this.notifications.send({
        to: `org:${organizationId}`,
        subject: `Recordatorio: ${reminder.reminderType}`,
        // NO clinical detail — only ids/type/date.
        body: `Animal ${reminder.animalId} — vence ${reminder.dueDate.toISOString()}`,
      });
    } catch {
      ok = false;
    }

    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.clinicalReminder.update({
        where: { id: reminderId },
        data: ok
          ? { status: ReminderStatus.Sent, sentAt: new Date(), channel: 'log' }
          : { status: ReminderStatus.Failed, channel: 'log' },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: null,
        action: 'animal.reminder_send_attempted',
        entityType: 'clinical_reminder',
        entityId: reminderId,
        metadata: { result: ok ? 'sent' : 'failed' },
      });
    });

    if (!ok) {
      // Signal BullMQ to retry (staggered backoff); the reminder remains in-app.
      throw new Error(`Notification send failed for reminder ${reminderId}`);
    }
  }

  /** Reminders of the caller's org, most-due first (any view role). */
  async list(): Promise<ClinicalReminder[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.clinicalReminder.findMany({ where: { organizationId }, orderBy: { dueDate: 'asc' } }),
    );
    return rows.map(toReminder);
  }

  /** Acknowledge or dismiss a reminder (Owner/Administrator/Operator/Veterinarian). */
  async resolve(
    actorUserId: string,
    reminderId: string,
    resolution: ReminderResolution,
  ): Promise<ClinicalReminder> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.clinicalReminder.findUnique({ where: { id: reminderId } });
      if (!existing) {
        throw new NotFoundException('Reminder not found');
      }
      if (!canResolve(existing.status as ReminderStatus)) {
        throw new BadRequestException('Reminder is already resolved');
      }
      const status = statusForResolution(resolution);
      const updated = await tx.clinicalReminder.update({
        where: { id: reminderId },
        data: { status, resolvedAt: new Date(), resolvedByUserId: actorUserId },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action:
          resolution === 'acknowledge'
            ? 'animal.reminder_acknowledged'
            : 'animal.reminder_dismissed',
        entityType: 'clinical_reminder',
        entityId: reminderId,
        metadata: { type: existing.reminderType },
      });
      return toReminder(updated);
    });
  }
}
