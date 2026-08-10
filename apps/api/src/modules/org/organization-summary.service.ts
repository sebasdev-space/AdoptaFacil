import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentStatus,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type OrganizationDashboardSummary,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { classifyDue } from '../animals/reminders.window';
import { DocumentsService } from './documents.service';
import { effectiveStatus } from './verification';

/**
 * % of formalization completed, derived from the state's POSITION in
 * {@link FORMALIZATION_SEQUENCE} (0–100). MUST stay numerically identical to
 * `deriveFormalizationPct` in `apps/web/src/shell/transparency/transparency-context.tsx`
 * (Fabián's file, the backend cannot import it) — same formula, duplicated on
 * purpose (same pattern as `ADOPTION_STATUS_EMAIL_LABELS` mirroring the web's
 * adoption status labels).
 */
function formalizationPercent(state: FormalizationState): number {
  const index = FORMALIZATION_SEQUENCE.indexOf(state);
  if (index < 0 || FORMALIZATION_SEQUENCE.length <= 1) return 0;
  return Math.round((index / (FORMALIZATION_SEQUENCE.length - 1)) * 100);
}

/**
 * Minimal organization summary (S2-08, M13) — 100% read-only aggregation of
 * counts/totals that already exist elsewhere in the app (animals, adoption
 * requests, sponsorships, documents, formalization, donations). No new
 * business logic: every field reuses an already-established definition (see
 * the field-level comments on {@link OrganizationDashboardSummary}). No time series, no
 * analytics, no gross/commission/net breakdown — explicitly out of scope for
 * this slice (`RutaPresentacion_13Ago_20260809.md`).
 */
@Injectable()
export class OrganizationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService<Env>,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async getSummary(): Promise<OrganizationDashboardSummary> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const expiringSoonWindowDays =
      this.config.get('DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS', { infer: true }) ?? 30;

    const [aggregates, verification] = await Promise.all([
      this.prisma.withOrgContext(organizationId, (tx) =>
        Promise.all([
          tx.animal.count({ where: { organizationId, isActive: true, status: 'available' } }),
          tx.adoptionRequest.count({
            where: { organizationId, status: { in: ['new', 'in_review'] } },
          }),
          tx.sponsorship.count({ where: { organizationId, status: 'active' } }),
          tx.organizationDocument.findMany({
            where: { organizationId },
            select: { status: true, expiresAt: true },
          }),
          tx.donation.findMany({
            where: { organizationId, status: 'approved', conceptKind: 'organization' },
            select: { breakdown: true },
          }),
          tx.organizationProfile.findUnique({
            where: { organizationId },
            select: { formalizationState: true },
          }),
        ]),
      ),
      // Same computation `GET /org/documents/verification` already exposes —
      // reused as-is instead of recomputing it here.
      this.documents.getVerification(),
    ]);
    const [
      animalsActive,
      adoptionRequestsPending,
      sponsorshipsActive,
      documentRows,
      donationRows,
      formalizationProfile,
    ] = aggregates;

    let documentsExpiringSoon = 0;
    let documentsRejected = 0;
    for (const row of documentRows) {
      const status = effectiveStatus(row.status as DocumentStatus, row.expiresAt, now);
      if (status === DocumentStatus.Rejected) {
        documentsRejected += 1;
      } else if (
        status === DocumentStatus.Approved &&
        classifyDue(row.expiresAt, now, expiringSoonWindowDays) === 'upcoming'
      ) {
        documentsExpiringSoon += 1;
      }
    }

    const donationsReceivedTotal = donationRows.reduce((sum, row) => {
      const breakdown = row.breakdown as unknown as { net: number };
      return sum + breakdown.net;
    }, 0);

    const formalizationState =
      (formalizationProfile?.formalizationState as FormalizationState) ??
      FormalizationState.Informal;

    return {
      animalsActive,
      adoptionRequestsPending,
      sponsorshipsActive,
      documentsExpiringSoon,
      documentsRejected,
      donationsReceivedTotal,
      formalizationLevel: verification.level,
      formalizationPercent: formalizationPercent(formalizationState),
    };
  }
}
