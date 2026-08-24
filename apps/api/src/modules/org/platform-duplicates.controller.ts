import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type OrganizationDuplicateFlag,
  type ReviewOrganizationDuplicateInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PlatformDuplicatesService } from './platform-duplicates.service';
import { reviewDuplicateFlagSchema } from './duplicate-detection.schemas';

/**
 * CROSS-TENANT platform review of flagged possible duplicate organizations
 * (M01, S-3). Gated to platform roles (deny-by-default): the RolesGuard
 * resolves the caller's role in their own tenant context, and the
 * cross-tenant reads/writes go through bounded SECURITY DEFINER functions —
 * so no org role can reach another org's duplicate flags.
 */
@Controller('platform/duplicates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformDuplicatesController {
  constructor(private readonly service: PlatformDuplicatesService) {}

  /** Review queue: pending duplicate flags across all organizations. */
  @Get('queue')
  queue(): Promise<OrganizationDuplicateFlag[]> {
    return this.service.queue();
  }

  /** Dismiss ("no es duplicado") or confirm a flag. */
  @Post(':id/decision')
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewDuplicateFlagSchema)) dto: ReviewOrganizationDuplicateInput,
  ): Promise<OrganizationDuplicateFlag> {
    return this.service.decide(actor.id, id, dto);
  }
}
