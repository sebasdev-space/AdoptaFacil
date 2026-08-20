import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrganizationBankAccountView, RegisterBankAccountInput } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';

/**
 * The organization's OWN registered bank account (M15b, RF26) — the ONLY
 * payout destination (no custody invariant: see `PayoutBankAccount` doc in
 * contracts). Tenant-scoped (RLS): an org only ever reads/writes its own row.
 * Registering REPLACES the existing account (PK = organizationId, upsert) —
 * there is only ever one active account per org.
 */
@Injectable()
export class BankAccountsService {
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

  /** Register/replace the caller org's bank account (Owner/Administrator). */
  async register(
    actorUserId: string,
    input: RegisterBankAccountInput,
  ): Promise<OrganizationBankAccountView> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.organizationBankAccount.upsert({
        where: { organizationId },
        create: { organizationId, ...input },
        update: { ...input },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'payments.bank_account_registered',
        entityType: 'organization_bank_account',
        entityId: organizationId,
        // NUNCA el número de cuenta completo en claro — solo los últimos 4
        // dígitos (suficiente para que un auditor confirme "cuál" cambió).
        metadata: {
          bankCode: input.bankCode,
          accountType: input.accountType,
          accountNumberLast4: input.accountNumber.slice(-4),
        },
      });
      return this.toView(row);
    });
  }

  /** The caller org's own registered bank account. */
  async getMine(): Promise<OrganizationBankAccountView> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationBankAccount.findUnique({ where: { organizationId } }),
    );
    if (!row) {
      throw new NotFoundException('La organización aún no ha registrado una cuenta bancaria.');
    }
    return this.toView(row);
  }

  /**
   * Internal read for the payout dispatcher (SAME module, already running
   * under `withOrgContext(organizationId, ...)` — no cross-tenant concern).
   * Returns null (never throws) so the caller can fail the payout cleanly.
   */
  async findForOrgTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<OrganizationBankAccountView | null> {
    const row = await tx.organizationBankAccount.findUnique({ where: { organizationId } });
    return row ? this.toView(row) : null;
  }

  private toView(row: {
    organizationId: string;
    bankCode: string;
    accountType: string;
    accountNumber: string;
    accountHolderName: string;
    accountHolderDocument: string;
    updatedAt: Date;
  }): OrganizationBankAccountView {
    return {
      organizationId: row.organizationId,
      bankCode: row.bankCode,
      accountType: row.accountType as OrganizationBankAccountView['accountType'],
      accountNumber: row.accountNumber,
      accountHolderName: row.accountHolderName,
      accountHolderDocument: row.accountHolderDocument,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
