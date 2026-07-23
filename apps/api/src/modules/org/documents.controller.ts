import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type OrganizationDocument,
  type UploadOrganizationDocumentInput,
  type UploadOrganizationDocumentResult,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { DocumentsService } from './documents.service';
import { uploadDocumentSchema } from './documents.schemas';

/**
 * M01 organization documents (RF03) — tenant-scoped (RLS). Uploading/renewing a
 * document is restricted to Owner/Administrator; viewing the documents and the
 * computed verification level additionally allows the ReadOnlyAuditor. Platform
 * REVIEW (cross-tenant) is a separate, platform-gated controller.
 */
@Controller('org/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  /** List the org's documents (effective status reflects expiry). */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  list(): Promise<OrganizationDocument[]> {
    return this.service.list();
  }

  /** Verification level computed from Approved & current documents. */
  @Get('verification')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  verification(): Promise<VerificationLevel> {
    return this.service.getVerification();
  }

  /** Upload a new document version / renew (subsanación). Owner/Administrator. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  upload(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadDocumentSchema)) dto: UploadOrganizationDocumentInput,
  ): Promise<UploadOrganizationDocumentResult> {
    return this.service.upload(actor.id, dto);
  }
}
