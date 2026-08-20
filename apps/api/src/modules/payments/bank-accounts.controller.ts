import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  Role,
  type OrganizationBankAccountView,
  type RegisterBankAccountInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { BankAccountsService } from './bank-accounts.service';
import { registerBankAccountSchema } from './bank-accounts.schemas';

/** Roles that manage the org's payout destination — same set as other
 *  org-management endpoints (Owner/Administrator), deny-by-default otherwise. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

/**
 * M15b (RF26) — the organization's OWN registered bank account, the only
 * payout destination (no custody). Tenant-scoped (RLS); gated to
 * Owner/Administrator (financial data), same guard order as every other
 * RBAC-protected controller in this codebase.
 */
@Controller('org/payout-bank-account')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGE_ROLES)
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get()
  getMine(): Promise<OrganizationBankAccountView> {
    return this.service.getMine();
  }

  @Put()
  register(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(registerBankAccountSchema)) dto: RegisterBankAccountInput,
  ): Promise<OrganizationBankAccountView> {
    return this.service.register(actor.id, dto);
  }
}
