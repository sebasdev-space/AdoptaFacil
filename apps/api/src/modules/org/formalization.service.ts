import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { FormalizationTransition as TransitionRow } from '@prisma/client';
import {
  type FormalizationStatus,
  FormalizationState,
  type FormalizationTransition,
  type RequestFormalizationTransitionInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { DianVerificationService, parseDianVerification } from './dian-verification.service';
import { DocumentsService } from './documents.service';
import { checkTransition, rteVigenteFor } from './formalization.machine';

function toTransition(row: TransitionRow): FormalizationTransition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fromState: row.fromState as FormalizationState,
    toState: row.toState as FormalizationState,
    actorUserId: row.actorUserId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TransitionResult {
  status: FormalizationStatus;
  transition: FormalizationTransition;
}

@Injectable()
export class FormalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly dianVerification: DianVerificationService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Current formalization state + rteVigente (+ DIAN verification, S-2) for
   *  the caller's org. */
  async getStatus(): Promise<FormalizationStatus> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      return {
        state: (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
        rteVigente: profile?.rteVigente ?? false,
        dianVerification: parseDianVerification(organizationId, profile?.dianVerification),
      };
    });
  }

  /** Append-only history for the caller's org, oldest first. */
  async getHistory(): Promise<FormalizationTransition[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.formalizationTransition.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map(toTransition);
  }

  /**
   * Move the org one adjacent step (Owner only, enforced at the controller).
   * Validates via the state machine, keeps the SAME organization_id, records an
   * immutable history entry and a transversal audit event — all in one
   * RLS-scoped transaction.
   */
  async transition(
    actorUserId: string,
    input: RequestFormalizationTransitionInput,
  ): Promise<TransitionResult> {
    const organizationId = this.requireOrgId();
    let shouldTriggerDianVerification = false;
    let nitForDianVerification: string | null = null;

    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      const from =
        (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal;

      // Parametrizable document gate (T-103): a forward step may require certain
      // documents to be Approved & current. The catalog is empty by default
      // (TODO(client) in TRANSITION_REQUIREMENTS), so this is a no-op until seeded.
      const satisfiedDocuments = await this.documents.satisfiedTypesInTx(tx, organizationId);
      // S-2 (RNF07): the ESAL_RTE gate needs a CONCRETE status here, never
      // `undefined` — otherwise the machine's "absent means ungated" default
      // (meant for pure unit tests) would silently bypass real production
      // requests. No attempt ever made yet reads the same as "pending".
      const dianStatus =
        parseDianVerification(organizationId, profile?.dianVerification)?.status ?? 'pending';
      const check = checkTransition(from, input.targetState, { satisfiedDocuments, dianStatus });
      if (!check.allowed) {
        throw new BadRequestException(check.error);
      }
      const reason = input.reason?.trim() ? input.reason.trim() : undefined;
      if (check.requiresReason && !reason) {
        throw new BadRequestException(
          'A reason is required to move the formalization state backward.',
        );
      }

      const rteVigente = rteVigenteFor(input.targetState);
      await tx.organizationProfile.upsert({
        where: { organizationId },
        create: { organizationId, formalizationState: input.targetState, rteVigente },
        update: { formalizationState: input.targetState, rteVigente },
      });

      // S1-05: the verification level is a computed effect of formalization +
      // documents, never set directly — recompute it now that formalization
      // moved (the profile row above already exists, from this same upsert).
      await this.documents.recomputeAndPersistVerification(tx, organizationId);

      const row = await tx.formalizationTransition.create({
        data: {
          organizationId,
          fromState: from,
          toState: input.targetState,
          actorUserId,
          reason: reason ?? null,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.formalization_changed',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { from, to: input.targetState, kind: check.kind },
      });

      // S-2 (RNF07): reaching ESAL auto-triggers the DIAN RTE verification —
      // captured here (inside the tx, where `profile.nit` is already loaded)
      // but enqueued AFTER the transaction commits, same "external I/O never
      // inside the DB transaction" rule as DocumentsService/RemindersService.
      // Silently skipped with no NIT yet — that's a data-completeness gap for
      // the Owner to fix in Datos institucionales, not a reason to block
      // reaching ESAL itself (not required by the base document).
      if (input.targetState === FormalizationState.ESAL && profile?.nit) {
        shouldTriggerDianVerification = true;
        nitForDianVerification = profile.nit;
      }

      return {
        status: { state: input.targetState, rteVigente },
        transition: toTransition(row),
      };
    });

    if (shouldTriggerDianVerification && nitForDianVerification) {
      await this.dianVerification.enqueue(organizationId, nitForDianVerification, 'auto', null);
    }

    return result;
  }
}
