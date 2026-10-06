import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Role,
  type AdoptionContract,
  type GenerateAdoptionContractInput,
  type SignAdoptionContractInput,
  type TransitionAdoptionContractInput,
  type UpdateAdoptionContractDataInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AdoptionContractsService } from './adoption-contracts.service';
import {
  generateAdoptionContractSchema,
  signAdoptionContractSchema,
  transitionAdoptionContractSchema,
  updateAdoptionContractDataSchema,
} from './adoption-contracts.schemas';

/** Roles that GENERATE/MANAGE the contract (§13) — same org set as evaluation in
 *  T-028a (Owner/Administrator/Operator). NOT the platform admin. The adopter
 *  (Persona) only signs their part and never reaches the org-gated routes. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M04 adoption CONTRACTS (T-028b, RF11). Two audiences under one authenticated
 * guard:
 *   - the OWNING organization generates/manages the contract (deny-by-default,
 *     MANAGE_ROLES only);
 *   - a SIGNER (org representative or the adopter Person) fetches and signs their
 *     own part — authorization is by signer identity in the service, resolved
 *     cross-tenant via a SECURITY DEFINER function.
 * All rows are tenant-scoped (RLS); a `signed` contract is immutable.
 */
@Controller('adoptions/contracts')
@UseGuards(JwtAuthGuard)
export class AdoptionContractsController {
  constructor(private readonly service: AdoptionContractsService) {}

  /** Generate the contract for an approved request (org). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  generate(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(generateAdoptionContractSchema)) dto: GenerateAdoptionContractInput,
  ): Promise<AdoptionContract> {
    return this.service.generate(actor, dto);
  }

  /** The contract of a request, for the owning org kanban. */
  @Get('by-request/:requestId')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  getForOrg(@Param('requestId', ParseUUIDPipe) requestId: string): Promise<AdoptionContract> {
    return this.service.getForOrg(requestId);
  }

  /** The contract detail page for the owning org (ANY manager, not just
   *  whoever generated it — unlike the signer-identity route below). Declared
   *  BEFORE `:id` so the literal `org` segment is never swallowed by it. */
  @Get('org/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  getForOrgById(@Param('id', ParseUUIDPipe) id: string): Promise<AdoptionContract> {
    return this.service.getForOrgById(id);
  }

  /** A signer fetches the contract they must sign (org rep or adopter). */
  @Get(':id')
  getForSigner(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdoptionContract> {
    return this.service.getForSigner(actor, id);
  }

  /** Move the contract between org-managed states (draft→pending, cancel). */
  @Post(':id/transitions')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  transition(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionAdoptionContractSchema))
    dto: TransitionAdoptionContractInput,
  ): Promise<AdoptionContract> {
    return this.service.transition(actor, id, dto);
  }

  /** Sign one party's part (any authenticated signer; identity checked in service). */
  @Post(':id/signatures')
  sign(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(signAdoptionContractSchema)) dto: SignAdoptionContractInput,
  ): Promise<AdoptionContract> {
    return this.service.sign(actor, id, dto);
  }

  /** Edit the fillable data (peso, estado de salud, etc.) while the contract
   *  is still a draft with no signatures yet (org). */
  @Patch(':id/data')
  @UseGuards(RolesGuard)
  @Roles(...MANAGE_ROLES)
  updateData(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdoptionContractDataSchema))
    dto: UpdateAdoptionContractDataInput,
  ): Promise<AdoptionContract> {
    return this.service.updateData(actor, id, dto);
  }

  /** Download the contract as a real PDF (any legitimate signer, any status —
   *  lets the org preview the draft before sending it to signatures). */
  @Get(':id/pdf')
  async pdf(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.service.generatePdf(actor, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="contrato-adopcion.pdf"');
    res.send(buffer);
  }
}
