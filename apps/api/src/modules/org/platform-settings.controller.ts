import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  Role,
  type PlatformSettings,
  type UpdatePlatformSettingsInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PlatformSettingsService } from './platform-settings.service';
import { updatePlatformSettingsSchema } from './platform-settings.schemas';

/**
 * Platform-wide settings (M01/RF01, T-030). Gated to platform roles
 * (deny-by-default): the RolesGuard resolves the caller's role in their own
 * tenant context, so no org role can read or change the global policy. Changing
 * it is audited. The `showOrganizationType` policy is applied by the public
 * `organization_public` projection.
 */
@Controller('platform/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get()
  get(): Promise<PlatformSettings> {
    return this.service.get();
  }

  @Put()
  update(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updatePlatformSettingsSchema)) dto: UpdatePlatformSettingsInput,
  ): Promise<PlatformSettings> {
    return this.service.update(actor.id, dto);
  }
}
