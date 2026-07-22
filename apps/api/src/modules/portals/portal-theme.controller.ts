import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { type PortalThemeConfig, Role, type UpdatePortalThemeInput } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PortalThemeService } from './portal-theme.service';
import { updatePortalThemeSchema } from './portals.schemas';

/**
 * M14 portal personalization endpoints (T-027). The owner reads/edits their org's
 * brand tokens (tenant-scoped, RLS); editing requires Owner/Administrator
 * (deny-by-default via RolesGuard). The public portal read is unauthenticated and
 * returns only the (public-by-nature) validated tokens.
 */
@Controller()
export class PortalThemeController {
  constructor(private readonly themes: PortalThemeService) {}

  /** The caller's own portal theme (any authenticated member may read it). */
  @Get('portals/theme')
  @UseGuards(JwtAuthGuard)
  getOwnTheme(): Promise<PortalThemeConfig> {
    return this.themes.getOwnTheme();
  }

  /** Create/patch the org's theme — Owner/Administrator only. Tokens are validated
   *  (format + contrast) before they reach the service. */
  @Put('portals/theme')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  updateTheme(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updatePortalThemeSchema)) dto: UpdatePortalThemeInput,
  ): Promise<PortalThemeConfig> {
    return this.themes.updateTheme(actor.id, dto);
  }

  /** PUBLIC portal theme by slug — no auth; only the safe, validated tokens, never
   *  another org's private data (single-slug lookup via SECURITY DEFINER fn). */
  @Get('public/organizations/:slug/theme')
  getPublic(@Param('slug') slug: string): Promise<PortalThemeConfig> {
    return this.themes.getPublicBySlug(slug);
  }
}
