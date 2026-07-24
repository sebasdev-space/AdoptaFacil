import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdoptionAnimalSnapshot,
  AdoptionApplicant,
  AdoptionRequest,
  AdoptionStatus,
  CreateAdoptionRequestInput,
  TransitionAdoptionRequestInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import type { RequestUser } from '../../core/auth/auth.types';
import { checkAdoptionTransition } from './adoption-status';

/** Shape returned by the `create_adoption_request` SQL function (snake_case). */
interface AdoptionRow {
  id: string;
  organization_id: string;
  animal_id: string;
  animal_snapshot: AdoptionAnimalSnapshot;
  applicant_user_id: string;
  applicant: AdoptionApplicant;
  message: string;
  status: string;
  contract_ref: string | null;
  tracking_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Prisma model row (camelCase) for `adoption_requests`. */
type AdoptionModel = Prisma.AdoptionRequestGetPayload<Record<string, never>>;

@Injectable()
export class AdoptionsService {
  private readonly logger = new Logger('Adoptions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
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
   * Create an adoption request as an authenticated PERSON (§M04, RF10). The
   * request lands in the OWNING org's tenant via the `create_adoption_request`
   * SECURITY DEFINER function (controlled cross-tenant write; the applicant is
   * not a member of that org). Enforces:
   *   - conflict of interest (§12): cannot apply to your own org's animal;
   *   - uniqueness (RF10): one ACTIVE request per (animal, user) — partial index;
   *   - message length (RF10) — validated by the zod schema upstream.
   */
  async create(actor: RequestUser, input: CreateAdoptionRequestInput): Promise<AdoptionRequest> {
    if (actor.organizationId === input.organizationId) {
      throw new ForbiddenException(
        'No puedes postular a un animal de tu propia organización (conflicto de interés).',
      );
    }

    let row: AdoptionRow;
    try {
      const rows = await this.prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
        SELECT * FROM create_adoption_request(
          ${input.organizationId}::uuid,
          ${input.animalId}::uuid,
          ${JSON.stringify(input.animalSnapshot)}::jsonb,
          ${actor.id}::uuid,
          ${JSON.stringify(input.applicant)}::jsonb,
          ${input.message}
        )
      `);
      row = rows[0];
    } catch (error) {
      if (this.isActiveDuplicate(error)) {
        throw new ConflictException('Ya tienes una solicitud activa para este animal.');
      }
      throw error;
    }

    // Auditoría append-only: se registra en el tenant de la org destino
    // (AuditService.record fija su contexto). NUNCA datos personales en claro.
    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: actor.id,
      action: 'adoption.request.created',
      entityType: 'adoption_request',
      entityId: row.id,
      metadata: { animalId: input.animalId },
    });

    return this.fromRow(row);
  }

  /** The org's own adoption requests for the evaluation kanban (RLS-scoped). */
  async listForOrg(): Promise<AdoptionRequest[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionRequest.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map((r) => this.fromModel(r));
  }

  /** Move a request through the evaluation state machine, AUDITED (UTC). */
  async transition(
    actor: RequestUser,
    id: string,
    input: TransitionAdoptionRequestInput,
  ): Promise<AdoptionRequest> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      // RLS scopes the read to this org; a foreign id simply returns null.
      const current = await tx.adoptionRequest.findUnique({ where: { id } });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Solicitud de adopción no encontrada.');
      }
      const check = checkAdoptionTransition(current.status as AdoptionStatus, input.targetStatus);
      if (!check.allowed) {
        throw new ConflictException(check.error);
      }
      const next = await tx.adoptionRequest.update({
        where: { id },
        data: { status: input.targetStatus },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.request.transitioned',
        entityType: 'adoption_request',
        entityId: id,
        metadata: {
          from: current.status,
          to: input.targetStatus,
          reason: input.reason?.trim() || null,
        },
      });
      return next;
    });

    await this.notifyApplicant(updated);
    return this.fromModel(updated);
  }

  /** Best-effort applicant notification behind the simulable NotificationPort. */
  private async notifyApplicant(row: AdoptionModel): Promise<void> {
    const applicant = row.applicant as unknown as AdoptionApplicant;
    const snapshot = row.animalSnapshot as unknown as AdoptionAnimalSnapshot;
    try {
      await this.notifications.send({
        to: applicant.email,
        subject: `Tu solicitud de adopción de ${snapshot.name}`,
        body: `El estado de tu solicitud cambió a: ${row.status}.`,
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al solicitante: ${(error as Error).message}`);
    }
  }

  /** A raw-query error caused by the active-request partial unique index. */
  private isActiveDuplicate(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = JSON.stringify(error.meta ?? {});
      return (
        error.code === 'P2002' ||
        meta.includes('adoption_requests_active_uq') ||
        meta.includes('23505')
      );
    }
    return false;
  }

  private fromRow(row: AdoptionRow): AdoptionRequest {
    return {
      id: row.id,
      organizationId: row.organization_id,
      animalId: row.animal_id,
      animalSnapshot: row.animal_snapshot,
      applicantUserId: row.applicant_user_id,
      applicant: row.applicant,
      message: row.message,
      status: row.status as AdoptionStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      contractRef: row.contract_ref ?? undefined,
      trackingRef: row.tracking_ref ?? undefined,
    };
  }

  private fromModel(row: AdoptionModel): AdoptionRequest {
    return {
      id: row.id,
      organizationId: row.organizationId,
      animalId: row.animalId,
      animalSnapshot: row.animalSnapshot as unknown as AdoptionAnimalSnapshot,
      applicantUserId: row.applicantUserId,
      applicant: row.applicant as unknown as AdoptionApplicant,
      message: row.message,
      status: row.status as AdoptionStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contractRef: row.contractRef ?? undefined,
      trackingRef: row.trackingRef ?? undefined,
    };
  }
}
