import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { type Paginated, Role, type VolunteerCertificate } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { VolunteerCertificatesService } from './volunteer-certificates.service';

/** Roles that may issue a certificate (RF18/RF19) and view the org's own
 *  issued-certificate list. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M08 volunteer certificates (RF18/RF19) — tenant-scoped for issuance/listing
 * (Owner/Administrator manage; + ReadOnlyAuditor views); single-certificate
 * reads (`:id`, `:id/pdf`) are dual-viewer (the issuing org OR the
 * certificate's own volunteer) — authorized at the data layer by
 * `volunteer_certificate_for_viewer`, so no `@Roles` gate is needed there
 * (same pattern as M07 sponsorships' identity-scoped reads).
 */
@Controller('volunteer-certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VolunteerCertificatesController {
  constructor(private readonly service: VolunteerCertificatesService) {}

  @Post(':enrollmentId')
  @Roles(...MANAGE_ROLES)
  issue(
    @CurrentUser() actor: RequestUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
  ): Promise<VolunteerCertificate> {
    return this.service.issue(actor.id, enrollmentId);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  listByOrg(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<VolunteerCertificate>> {
    return this.service.listByOrg(Number(limit), Number(offset));
  }

  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<VolunteerCertificate[]> {
    return this.service.listMine(actor);
  }

  @Get(':id')
  get(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VolunteerCertificate> {
    return this.service.get(id, actor);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.service.generatePdf(id, actor);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="certificado.pdf"');
    res.send(buffer);
  }
}
