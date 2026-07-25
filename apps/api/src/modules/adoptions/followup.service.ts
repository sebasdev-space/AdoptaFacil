import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AdoptionContractSigner,
  type AdoptionFollowUpEvidence,
  type AdoptionFollowUpMilestone,
  type FollowUpMilestoneStatus,
  type FollowUpQuestion,
  type ScheduleFollowUpMilestoneInput,
  type SubmitFollowUpInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import type { RequestUser } from '../../core/auth/auth.types';
import { canSubmitFollowUp, checkFollowUpTransition } from './followup-status';

/** Row shape returned by the SECURITY DEFINER milestone functions (snake_case). */
interface MilestoneRow {
  id: string;
  organization_id: string;
  contract_id: string;
  request_id: string;
  adopter_user_id: string;
  adopter_name: string;
  adopter_email: string;
  title: string;
  questionnaire: FollowUpQuestion[];
  due_at: Date;
  status: string;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

type MilestoneModel = Prisma.AdoptionFollowUpMilestoneGetPayload<{ include: { evidence: true } }>;
type EvidenceModel = Prisma.AdoptionFollowUpEvidenceGetPayload<Record<string, never>>;

/** A milestone that just went overdue — enough for the worker to alert. */
export interface OverdueMilestone {
  id: string;
  organizationId: string;
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger('AdoptionFollowUp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Schedule a follow-up milestone for a SIGNED contract (§M04, RF12). Org-gated at
   * the controller. Derives the adopter (identity + contact) from the contract's
   * `adopter` signer, materializes T-028b's `trackingRef` seam on the request, and
   * AUDITS the scheduling (UTC, no PII).
   */
  async schedule(
    actor: RequestUser,
    input: ScheduleFollowUpMilestoneInput,
  ): Promise<AdoptionFollowUpMilestone> {
    const organizationId = this.requireOrgId();
    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const contract = await tx.adoptionContract.findUnique({ where: { id: input.contractId } });
      if (!contract || contract.organizationId !== organizationId) {
        throw new NotFoundException('Contrato no encontrado.');
      }
      if (contract.status !== 'signed') {
        throw new ConflictException('El contrato debe estar firmado para iniciar el seguimiento.');
      }

      const signers = contract.signers as unknown as AdoptionContractSigner[];
      const adopter = signers.find((s) => s.role === 'adopter');
      if (!adopter || !adopter.userId) {
        throw new ConflictException('El contrato no tiene un adoptante firmante válido.');
      }

      const questionnaire: FollowUpQuestion[] = (input.questionnaire ?? []).map((q) => ({
        id: q.id ?? randomUUID(),
        prompt: q.prompt,
        kind: q.kind,
        ...(q.required !== undefined ? { required: q.required } : {}),
      }));

      const row = await tx.adoptionFollowUpMilestone.create({
        data: {
          organizationId,
          contractId: contract.id,
          requestId: contract.requestId,
          adopterUserId: adopter.userId,
          adopterName: adopter.fullName,
          adopterEmail: adopter.email,
          title: input.title,
          questionnaire: questionnaire as unknown as Prisma.InputJsonValue,
          dueAt: new Date(input.dueAt),
          status: 'scheduled',
        },
        include: { evidence: true },
      });

      // Materialize the T-028a/b `trackingRef` seam once tracking begins.
      await tx.adoptionRequest.updateMany({
        where: { id: contract.requestId, trackingRef: null },
        data: { trackingRef: contract.id },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.followup.scheduled',
        entityType: 'adoption_followup_milestone',
        entityId: row.id,
        metadata: { contractId: contract.id, dueAt: input.dueAt },
      });

      return row;
    });

    return this.fromModel(created);
  }

  /** Milestones of a contract, for the OWNING org (RLS-scoped), with evidence. */
  async listForContract(contractId: string): Promise<AdoptionFollowUpMilestone[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionFollowUpMilestone.findMany({
        where: { contractId },
        orderBy: { dueAt: 'asc' },
        include: { evidence: true },
      }),
    );
    return rows.map((r) => this.fromModel(r));
  }

  /**
   * The adopter's own milestones (cross-tenant via SECURITY DEFINER), so a Person
   * can see and respond to the follow-ups of THEIR adoption.
   */
  async listMine(actor: RequestUser): Promise<AdoptionFollowUpMilestone[]> {
    const rows = await this.prisma.$queryRaw<MilestoneRow[]>(Prisma.sql`
      SELECT * FROM adoption_followups_for_adopter_all(${actor.id}::uuid)
    `);
    return rows.map((r) => this.fromRow(r, []));
  }

  /**
   * The adopter responds a milestone (§M04, RF12): records questionnaire answers
   * and/or a photo (uploaded via the simulable StoragePort) as evidence, and marks
   * the milestone completed by default. Cross-tenant, gated by adopter identity via
   * the SECURITY DEFINER function. Audited (UTC, no PII).
   */
  async submit(
    actor: RequestUser,
    milestoneId: string,
    input: SubmitFollowUpInput,
  ): Promise<AdoptionFollowUpMilestone> {
    const current = await this.loadForAdopter(milestoneId, actor.id);
    if (!current) {
      throw new NotFoundException('Hito de seguimiento no encontrado o no eres el adoptante.');
    }
    if (!canSubmitFollowUp(current.status as FollowUpMilestoneStatus)) {
      throw new ConflictException(`El hito no admite respuestas (estado: ${current.status}).`);
    }

    const hasPhoto = Boolean(input.photoFilename);
    let storageRef: string | null = null;
    let storageUrl: string | null = null;
    if (hasPhoto) {
      const stored = await this.storage.createUploadTarget({
        organizationId: current.organization_id,
        filename: input.photoFilename as string,
      });
      storageRef = stored.key;
      storageUrl = stored.url;
    }

    const kind = hasPhoto ? 'photo' : 'questionnaire';
    const complete = input.complete ?? true;
    const answers = input.answers ? JSON.stringify(input.answers) : null;

    const rows = await this.prisma.$queryRaw<MilestoneRow[]>(Prisma.sql`
      SELECT * FROM adoption_followup_submit(
        ${milestoneId}::uuid,
        ${actor.id}::uuid,
        ${kind},
        ${answers}::jsonb,
        ${storageRef},
        ${storageUrl},
        ${complete}
      )
    `);
    const updated = rows[0];
    if (!updated) {
      throw new ConflictException('No se pudo registrar la respuesta (el estado cambió).');
    }

    const organizationId = current.organization_id;
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'adoption.followup.evidence_added',
      entityType: 'adoption_followup_milestone',
      entityId: milestoneId,
      metadata: { kind, hasPhoto },
    });
    if (complete) {
      await this.audit.record({
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.followup.completed',
        entityType: 'adoption_followup_milestone',
        entityId: milestoneId,
        metadata: { by: 'adopter' },
      });
    }

    return this.fromRow(updated, []);
  }

  /** The org closes (completes) a milestone (§13 org roles). */
  async complete(actor: RequestUser, milestoneId: string): Promise<AdoptionFollowUpMilestone> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionFollowUpMilestone.findUnique({
        where: { id: milestoneId },
        include: { evidence: true },
      });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Hito de seguimiento no encontrado.');
      }
      const check = checkFollowUpTransition(current.status as FollowUpMilestoneStatus, 'completed');
      if (!check.allowed) {
        throw new ConflictException(check.error);
      }
      const next = await tx.adoptionFollowUpMilestone.update({
        where: { id: milestoneId },
        data: { status: 'completed', completedAt: new Date() },
        include: { evidence: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.followup.completed',
        entityType: 'adoption_followup_milestone',
        entityId: milestoneId,
        metadata: { by: 'organization' },
      });
      return next;
    });
    return this.fromModel(updated);
  }

  /**
   * Worker pass (no tenant context): mark scheduled milestones past their due date
   * as `overdue` (bounded SECURITY DEFINER scan across tenants) and emit a best-
   * effort alert via the NotificationPort for each. Both the transition and the
   * alert are AUDITED (UTC). Returns the milestones that went overdue this run.
   */
  async runOverdueScan(): Promise<OverdueMilestone[]> {
    const rows = await this.prisma.$queryRaw<MilestoneRow[]>(Prisma.sql`
      SELECT * FROM adoption_followups_mark_overdue()
    `);

    const overdue: OverdueMilestone[] = [];
    for (const row of rows) {
      await this.audit.record({
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'adoption.followup.overdue',
        entityType: 'adoption_followup_milestone',
        entityId: row.id,
        metadata: { dueAt: row.due_at.toISOString() },
      });

      let sent = true;
      try {
        await this.notifications.send({
          to: row.adopter_email,
          subject: `Seguimiento de adopción pendiente: ${row.title}`,
          // NO PII/clinical detail beyond the milestone title.
          body: `Tu hito de seguimiento "${row.title}" venció el ${row.due_at.toISOString()}. Por favor complétalo.`,
        });
      } catch (error) {
        sent = false;
        this.logger.warn(`No se pudo alertar el hito ${row.id}: ${(error as Error).message}`);
      }

      await this.audit.record({
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'adoption.followup.alert_sent',
        entityType: 'adoption_followup_milestone',
        entityId: row.id,
        metadata: { result: sent ? 'sent' : 'failed' },
      });

      overdue.push({ id: row.id, organizationId: row.organization_id });
    }
    return overdue;
  }

  /** Load a milestone for the adopter via the SECURITY DEFINER function. */
  private async loadForAdopter(milestoneId: string, userId: string): Promise<MilestoneRow | null> {
    const rows = await this.prisma.$queryRaw<MilestoneRow[]>(Prisma.sql`
      SELECT * FROM adoption_followup_for_adopter(${milestoneId}::uuid, ${userId}::uuid)
    `);
    return rows[0] ?? null;
  }

  private fromEvidence(e: EvidenceModel): AdoptionFollowUpEvidence {
    return {
      id: e.id,
      milestoneId: e.milestoneId,
      kind: e.kind as AdoptionFollowUpEvidence['kind'],
      answers: (e.answers as Record<string, unknown> | null) ?? undefined,
      photoUrl: e.storageUrl ?? undefined,
      storageRef: e.storageRef ?? undefined,
      submittedByUserId: e.submittedByUserId,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private fromModel(row: MilestoneModel): AdoptionFollowUpMilestone {
    return {
      id: row.id,
      organizationId: row.organizationId,
      contractId: row.contractId,
      requestId: row.requestId,
      adopterUserId: row.adopterUserId,
      adopterName: row.adopterName,
      adopterEmail: row.adopterEmail,
      title: row.title,
      questionnaire: row.questionnaire as unknown as FollowUpQuestion[],
      dueAt: row.dueAt.toISOString(),
      status: row.status as FollowUpMilestoneStatus,
      completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      evidence: row.evidence.map((e) => this.fromEvidence(e)),
    };
  }

  private fromRow(
    row: MilestoneRow,
    evidence: AdoptionFollowUpEvidence[],
  ): AdoptionFollowUpMilestone {
    return {
      id: row.id,
      organizationId: row.organization_id,
      contractId: row.contract_id,
      requestId: row.request_id,
      adopterUserId: row.adopter_user_id,
      adopterName: row.adopter_name,
      adopterEmail: row.adopter_email,
      title: row.title,
      questionnaire: row.questionnaire,
      dueAt: row.due_at.toISOString(),
      status: row.status as FollowUpMilestoneStatus,
      completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      evidence,
    };
  }
}
