import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type AdoptionRequest,
  type CreateAdoptionRequestInput,
  type TransitionAdoptionRequestInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AdoptionsService } from './adoptions.service';
import { createAdoptionRequestSchema, transitionAdoptionRequestSchema } from './adoptions.schemas';

/** Roles that EVALUATE requests on the org kanban (§12/§13 matrix). */
const EVAL_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M04 adoptions (T-028a). Two audiences behind one authenticated guard:
 *   - a PERSON creates a request (`POST /adoptions`) — any authenticated user;
 *     the conflict-of-interest rule (§12) blocks applying to one's own org.
 *   - the OWNING organization evaluates on the kanban (`GET /adoptions`,
 *     `POST /adoptions/:id/transitions`) — Owner/Administrator/Operator only
 *     (deny-by-default). All request rows are tenant-scoped (RLS).
 */
@Controller('adoptions')
@UseGuards(JwtAuthGuard)
export class AdoptionsController {
  constructor(private readonly service: AdoptionsService) {}

  /** Create an adoption request (authenticated person). */
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createAdoptionRequestSchema)) dto: CreateAdoptionRequestInput,
  ): Promise<AdoptionRequest> {
    return this.service.create(actor, dto);
  }

  /** The org's requests for the evaluation kanban. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(...EVAL_ROLES)
  list(): Promise<AdoptionRequest[]> {
    return this.service.listForOrg();
  }

  /** Move a request through the evaluation state machine (audited). */
  @Post(':id/transitions')
  @UseGuards(RolesGuard)
  @Roles(...EVAL_ROLES)
  transition(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionAdoptionRequestSchema))
    dto: TransitionAdoptionRequestInput,
  ): Promise<AdoptionRequest> {
    return this.service.transition(actor, id, dto);
  }
}
