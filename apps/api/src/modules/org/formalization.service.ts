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
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Current formalization state + rteVigente for the caller's org. */
  async getStatus(): Promise<FormalizationStatus> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      return {
        state: (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
        rteVigente: profile?.rteVigente ?? false,
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
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      const from =
        (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal;

      const check = checkTransition(from, input.targetState);
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

      return {
        status: { state: input.targetState, rteVigente },
        transition: toTransition(row),
      };
    });
  }
}
