import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  type FormalizationStatus,
  type FormalizationTransition,
  Role,
  type RequestFormalizationTransitionInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { FormalizationService, type TransitionResult } from './formalization.service';
import { requestTransitionSchema } from './formalization.schemas';

/**
 * M01 formalization state machine (RF02). Reading the state/history requires
 * authentication (any org member); advancing/retreating the state is restricted
 * to the Owner (legal representative) per §13.
 */
@Controller('org/formalization')
@UseGuards(JwtAuthGuard)
export class FormalizationController {
  constructor(private readonly service: FormalizationService) {}

  @Get()
  getStatus(): Promise<FormalizationStatus> {
    return this.service.getStatus();
  }

  @Get('history')
  getHistory(): Promise<FormalizationTransition[]> {
    return this.service.getHistory();
  }

  @Post('transitions')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  transition(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(requestTransitionSchema)) dto: RequestFormalizationTransitionInput,
  ): Promise<TransitionResult> {
    return this.service.transition(actor.id, dto);
  }
}
