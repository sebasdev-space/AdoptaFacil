import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type LegalRepresentative,
  type RegisterLegalRepresentativeInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { LegalRepresentativeService } from './legal-representative.service';
import { registerLegalRepresentativeSchema } from './legal-representative.schemas';

/**
 * M01 legal representative signature (S-1, RF14 relacionado / RNF10) —
 * tenant-scoped (RLS). Registering/re-signing is Owner-only, deny-by-default
 * (an Owner may only ever create/replace THEIR OWN organization's signature —
 * see `LegalRepresentativeService.register`); reading the metadata (never the
 * raw signature bytes) is also open to Administrator/ReadOnlyAuditor, the same
 * roles allowed to read organization documents.
 */
@Controller('org/legal-representative')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LegalRepresentativeController {
  constructor(private readonly service: LegalRepresentativeService) {}

  /** The org's current (most recently signed) legal representative, or `null`. */
  @Get()
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  getCurrent(): Promise<LegalRepresentative | null> {
    return this.service.getCurrent();
  }

  /** Register or re-register (change of representative) — always a full
   *  submission; there is no partial-update endpoint. */
  @Post()
  @HttpCode(201)
  @Roles(Role.Owner)
  register(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(registerLegalRepresentativeSchema))
    dto: RegisterLegalRepresentativeInput,
  ): Promise<LegalRepresentative> {
    return this.service.register(actor.id, dto);
  }
}
