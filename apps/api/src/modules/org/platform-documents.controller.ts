import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type DocumentReviewQueueItem,
  type OrganizationDocument,
  type ReviewOrganizationDocumentInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PlatformDocumentsService } from './platform-documents.service';
import { reviewDocumentSchema } from './documents.schemas';

/**
 * CROSS-TENANT platform review of organization documents (M01, RF03). Gated to
 * platform roles (deny-by-default): the RolesGuard resolves the caller's role in
 * their own tenant context, and the cross-tenant reads/writes go through bounded
 * SECURITY DEFINER functions — so no org role can reach another org's documents.
 */
@Controller('platform/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformDocumentsController {
  constructor(private readonly service: PlatformDocumentsService) {}

  /** Review queue: Pending/UnderReview documents across all organizations. */
  @Get('queue')
  queue(): Promise<DocumentReviewQueueItem[]> {
    return this.service.queue();
  }

  /** Observe / approve / reject a document. A reason is mandatory for
   *  observe/reject (400 otherwise). */
  @Post(':id/decision')
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewDocumentSchema)) dto: ReviewOrganizationDocumentInput,
  ): Promise<OrganizationDocument> {
    return this.service.decide(actor.id, id, dto);
  }
}
