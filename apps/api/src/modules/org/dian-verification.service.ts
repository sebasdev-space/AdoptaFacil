import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { DianVerificationCheckStatus, DianVerificationStatus } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { DIAN_PORT, type DianPort } from './dian.port';
import {
  DIAN_VERIFICATION_JOB,
  DIAN_VERIFICATION_QUEUE,
  type DianVerificationJobData,
  type DianVerificationTrigger,
} from './dian-verification.constants';
import {
  DIAN_VERIFICATION_MAX_ATTEMPTS,
  deriveDianAttemptOutcome,
} from './dian-verification.window';

/** Shape persisted in `organization_profiles.dian_verification` (JSON). */
interface StoredDianVerification {
  status: DianVerificationCheckStatus;
  attemptsCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
}

/** Parses the profile's raw JSON column into the public contract shape.
 *  `undefined` means no verification has ever been attempted. */
export function parseDianVerification(
  organizationId: string,
  json: unknown,
): DianVerificationStatus | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const value = json as StoredDianVerification;
  return {
    organizationId,
    status: value.status,
    attemptsCount: value.attemptsCount,
    lastAttemptAt: value.lastAttemptAt,
    nextRetryAt: value.nextRetryAt,
  };
}

/**
 * M01 DIAN RTE verification (S-2, RF02 relacionado / RNF07), tenant-scoped via
 * RLS. Orchestrates the simulated verification (DianPort) behind a BullMQ
 * queue with the RNF07 staggered backoff (5min/30min/2h/24h) — see
 * `dian-verification.window.ts` for the pure schedule/status logic and
 * `DianVerificationProcessor` for the worker that calls
 * {@link attemptVerification}.
 */
@Injectable()
export class DianVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(DIAN_PORT) private readonly dian: DianPort,
    @InjectQueue(DIAN_VERIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Enqueue a fresh verification cycle (attempt 1 of a new retry ladder) —
   * used both by the auto-trigger (FormalizationService, on reaching ESAL)
   * and a manual retry. `nit` is passed in by the caller, who already read it
   * from the org's OWN profile inside its own tenant-scoped transaction —
   * this method never trusts a client-supplied NIT.
   */
  async enqueue(
    organizationId: string,
    nit: string,
    triggeredBy: DianVerificationTrigger,
    actorUserId: string | null,
  ): Promise<void> {
    const data: DianVerificationJobData = { organizationId, nit, triggeredBy, actorUserId };
    await this.queue.add(DIAN_VERIFICATION_JOB, data, {
      attempts: DIAN_VERIFICATION_MAX_ATTEMPTS,
      backoff: { type: 'custom' },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /** Owner/Administrator manual retry (RBAC enforced at the controller). Only
   *  meaningful once the org has reached ESAL — the base document doesn't
   *  define a DIAN verification concept before that state. */
  async retryManually(actorUserId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    const nit = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      if (profile?.formalizationState !== 'esal') {
        throw new BadRequestException(
          'La verificación DIAN solo aplica cuando la organización está en estado ESAL.',
        );
      }
      return profile.nit;
    });
    if (!nit) {
      throw new BadRequestException(
        'La organización no tiene un NIT registrado — complétalo en Datos institucionales antes de reintentar.',
      );
    }
    await this.enqueue(organizationId, nit, 'manual', actorUserId);
  }

  /**
   * Executes ONE attempt (called by {@link DianVerificationProcessor}).
   * Persists the resulting status (fast-read projection on the profile) + an
   * append-only history row, then — on failure — re-throws so BullMQ retries
   * with the RNF07 backoff, same "always throw on failure, let BullMQ's own
   * `attempts` cap it" pattern as `RemindersService.send()`. The NIT is used
   * only for this call; it is NEVER written to `dian_verification_attempts`
   * or to the audit metadata (see the migration's comment — TODO(client) on
   * whether a masked form should ever be shown).
   */
  async attemptVerification(data: DianVerificationJobData, attemptsMade: number): Promise<void> {
    let verified = false;
    try {
      const result = await this.dian.verifyRteStatus(data.nit);
      verified = result.verified;
    } catch {
      verified = false;
    }

    const outcome = deriveDianAttemptOutcome(verified, attemptsMade, new Date());

    await this.prisma.withOrgContext(data.organizationId, async (tx) => {
      await tx.dianVerificationAttempt.create({
        data: {
          organizationId: data.organizationId,
          attemptNumber: outcome.attemptNumber,
          result: verified ? 'success' : 'failure',
          triggeredBy: data.triggeredBy,
          actorUserId: data.actorUserId,
        },
      });

      const stored: StoredDianVerification = {
        status: outcome.status,
        attemptsCount: outcome.attemptNumber,
        lastAttemptAt: new Date().toISOString(),
        ...(outcome.nextRetryAt ? { nextRetryAt: outcome.nextRetryAt.toISOString() } : {}),
      };
      await tx.organizationProfile.upsert({
        where: { organizationId: data.organizationId },
        create: {
          organizationId: data.organizationId,
          dianVerification: stored as unknown as Prisma.InputJsonValue,
        },
        update: { dianVerification: stored as unknown as Prisma.InputJsonValue },
      });

      await this.audit.recordWithTx(tx, {
        organizationId: data.organizationId,
        actorUserId: data.actorUserId,
        action: 'organization.dian_verification_attempted',
        entityType: 'organization',
        entityId: data.organizationId,
        metadata: {
          attemptNumber: outcome.attemptNumber,
          result: verified ? 'success' : 'failure',
          triggeredBy: data.triggeredBy,
        },
      });
    });

    if (!verified) {
      throw new Error(
        `DIAN verification attempt ${outcome.attemptNumber} failed for org ${data.organizationId}`,
      );
    }
  }
}
