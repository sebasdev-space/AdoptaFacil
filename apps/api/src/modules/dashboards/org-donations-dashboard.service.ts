import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CampaignStatus,
  type CampaignPerformanceItem,
  type DonationsStatusCounts,
  type OrgDonationsDashboardSummary,
  Role,
  type SponsorshipsHealthSummary,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { RbacService } from '../../core/rbac/rbac.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { computeProgress } from '../campaigns/campaign-progress';

/** Mismos roles que YA ven cada dato en su propio módulo hoy (ver el doc
 *  comment de `OrgDonationsDashboardSummary`, contracts/dashboards.ts) — esta
 *  página no inventa un permiso nuevo, solo compone lo que cada rol ya puede
 *  ver en otro lugar de la app. */
const DONATIONS_VIEW_ROLES = new Set<Role>([Role.Owner, Role.Administrator, Role.Operator]);
const CAMPAIGNS_VIEW_ROLES = new Set<Role>([
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
]);
const SPONSORSHIPS_VIEW_ROLES = new Set<Role>([
  Role.Owner,
  Role.Administrator,
  Role.ReadOnlyAuditor,
]);

/** Ventana fija "vence pronto" para campañas — no se pidió que fuera
 *  configurable (a diferencia de `DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS`). */
const CAMPAIGN_ENDING_SOON_WINDOW_DAYS = 14;

function hasAny(held: Role[], allowed: Set<Role>): boolean {
  return held.some((role) => allowed.has(role));
}

/**
 * Dashboard de donaciones/campañas de la organización (M13, S-14 — pedido del
 * cliente). Cada sección se calcula SOLO si el actor tiene alguno de los
 * roles que ya ven ese dato en su propio módulo (`DONATIONS_VIEW_ROLES`/
 * `CAMPAIGNS_VIEW_ROLES`/`SPONSORSHIPS_VIEW_ROLES`) — reutiliza
 * `RbacService.rolesForUser` (ya existente) en vez de reinventar la consulta
 * de `roles.guard.ts`. Una sección fuera de alcance queda `undefined`, nunca
 * un arreglo/objeto vacío fingiendo "no hay datos".
 */
@Injectable()
export class OrgDonationsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rbac: RbacService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async getSummary(actor: RequestUser): Promise<OrgDonationsDashboardSummary> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const heldRoles = await this.rbac.rolesForUser(actor.id);

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [donations, campaigns, sponsorships] = await Promise.all([
        hasAny(heldRoles, DONATIONS_VIEW_ROLES)
          ? this.getDonationsSection(tx, organizationId)
          : Promise.resolve(undefined),
        hasAny(heldRoles, CAMPAIGNS_VIEW_ROLES)
          ? this.getCampaignsSection(tx, organizationId, now)
          : Promise.resolve(undefined),
        hasAny(heldRoles, SPONSORSHIPS_VIEW_ROLES)
          ? this.getSponsorshipsSection(tx, organizationId)
          : Promise.resolve(undefined),
      ]);
      return { donations, campaigns, sponsorships };
    });
  }

  /** `netReceivedTotal` reutiliza EXACTAMENTE la definición de
   *  `OrganizationDashboardSummary.donationsReceivedTotal`
   *  (`organization-summary.service.ts`): aprobadas, `conceptKind='organization'`,
   *  nunca duplica lo atribuido a campañas. Los conteos por estado, en cambio,
   *  cubren TODAS las donaciones de la organización (el embudo de revisión es
   *  un eje distinto del total financiero). */
  private async getDonationsSection(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<DonationsStatusCounts> {
    const [statusGroups, netRows] = await Promise.all([
      tx.donation.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      tx.donation.findMany({
        where: { organizationId, status: 'approved', conceptKind: 'organization' },
        select: { breakdown: true },
      }),
    ]);
    const countByStatus = (status: string): number =>
      statusGroups.find((group) => group.status === status)?._count._all ?? 0;
    const netReceivedTotal = netRows.reduce((sum, row) => {
      const breakdown = row.breakdown as unknown as { net: number };
      return sum + breakdown.net;
    }, 0);

    return {
      pending: countByStatus('pending'),
      approved: countByStatus('approved'),
      declined: countByStatus('declined'),
      netReceivedTotal,
    };
  }

  /** `endingSoon`: activa Y el deadline cae en los próximos
   *  {@link CAMPAIGN_ENDING_SOON_WINDOW_DAYS} días (ni ya vencida, ni más
   *  lejana que la ventana). `progress` reutiliza `computeProgress()` (M06) —
   *  nunca una fórmula nueva. */
  private async getCampaignsSection(
    tx: Prisma.TransactionClient,
    organizationId: string,
    now: Date,
  ): Promise<CampaignPerformanceItem[]> {
    const rows = await tx.campaign.findMany({
      where: { organizationId },
      orderBy: { deadline: 'asc' },
    });
    const windowMs = CAMPAIGN_ENDING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return rows.map((row) => {
      const status = row.status as CampaignStatus;
      const msUntilDeadline = row.deadline.getTime() - now.getTime();
      const endingSoon =
        status === CampaignStatus.Active && msUntilDeadline > 0 && msUntilDeadline <= windowMs;

      return {
        id: row.id,
        title: row.title,
        status,
        goalAmount: row.goalAmount,
        raisedAmount: row.raisedAmount,
        progress: computeProgress(row.raisedAmount, row.goalAmount),
        deadline: row.deadline.toISOString(),
        endingSoon,
      };
    });
  }

  /** `atPaymentRisk`: apadrinamientos ACTIVOS cuyo período de facturación MÁS
   *  RECIENTE (el de `period` más alto) quedó en `pending` o `failed` —
   *  riesgo real de cobro, dato que hoy no se agrega en ningún lugar del
   *  sistema (ver investigación previa, S-14). */
  private async getSponsorshipsSection(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<SponsorshipsHealthSummary> {
    const rows = await tx.sponsorship.findMany({
      where: { organizationId },
      select: {
        status: true,
        payments: { orderBy: { period: 'desc' }, take: 1, select: { status: true } },
      },
    });

    let active = 0;
    let suspended = 0;
    let cancelled = 0;
    let atPaymentRisk = 0;
    for (const row of rows) {
      if (row.status === 'active') {
        active += 1;
        const latestPayment = row.payments[0];
        if (
          latestPayment &&
          (latestPayment.status === 'pending' || latestPayment.status === 'failed')
        ) {
          atPaymentRisk += 1;
        }
      } else if (row.status === 'suspended') {
        suspended += 1;
      } else if (row.status === 'cancelled') {
        cancelled += 1;
      }
    }

    return { active, suspended, cancelled, atPaymentRisk };
  }
}
