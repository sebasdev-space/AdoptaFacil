import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  computeReconciliationRow,
  type ReconciliationReport,
  type ReconciliationRawRow,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Default reporting window when the caller supplies no `from` (RF26,
 *  conciliación básica): the last 12 calendar months up to `to`. */
const DEFAULT_WINDOW_MONTHS = 12;

/** Row shape returned by `reconciliation_report` (snake_case, raw SQL). */
interface ReconciliationRow {
  organization_id: string;
  organization_name: string;
  period: string;
  collected: number;
  dispersed_paid: number;
  dispersed_scheduled: number;
  dispersed_failed: number;
}

function fromRow(row: ReconciliationRow): ReconciliationRawRow {
  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    period: row.period,
    collected: row.collected,
    dispersedPaid: row.dispersed_paid,
    dispersedScheduled: row.dispersed_scheduled,
    dispersedFailed: row.dispersed_failed,
  };
}

/**
 * M15b (F-5, RF26) — conciliación básica: cruza lo recaudado (donaciones
 * `approved`, por su `net`) contra lo dispersado (payouts, F-4), por
 * organización y por mes calendario (UTC). SOLO LECTURA: no persiste nada,
 * agrega sobre `donations`/`payouts` vía `reconciliation_report`
 * (SECURITY DEFINER — un reporte de plataforma es intrínsecamente
 * cross-tenant; la autorización la impone el controller vía RolesGuard,
 * igual que `payouts_for_organization`).
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(from?: Date, to?: Date, organizationId?: string): Promise<ReconciliationReport> {
    const toDate = to ?? new Date();
    const fromDate = from ?? defaultFrom(toDate);

    const rows = await this.prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`
      SELECT * FROM reconciliation_report(
        ${fromDate.toISOString()}::timestamp,
        ${toDate.toISOString()}::timestamp,
        ${organizationId ?? null}::uuid
      )
    `);

    return {
      generatedAt: new Date().toISOString(),
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      rows: rows.map((row) => computeReconciliationRow(fromRow(row))),
    };
  }
}

/** `to` minus 12 calendar months (UTC) — date arithmetic, not a fixed-day
 *  approximation, so month-length differences never skew the window. */
function defaultFrom(to: Date): Date {
  return new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - DEFAULT_WINDOW_MONTHS, to.getUTCDate()),
  );
}
