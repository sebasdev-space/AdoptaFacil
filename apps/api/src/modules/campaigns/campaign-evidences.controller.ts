import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CampaignEvidence,
  type CampaignEvidenceUploadResult,
  type CreateCampaignEvidenceInput,
  type Paginated,
  Role,
  type UpdateCampaignEvidenceInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CampaignEvidencesService } from './campaign-evidences.service';
import {
  createCampaignEvidenceSchema,
  updateCampaignEvidenceSchema,
} from './campaign-evidences.schemas';

/** Roles that may UPLOAD/EDIT/REMOVE an evidence — same as campaign management. */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/** Roles that may VIEW internally (write roles + the read-only auditor). */
const VIEW_ROLES = [...WRITE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M06 accountability evidences (RF16) — tenant-scoped (RLS), nested under a
 * campaign. Upload/edit/remove = Owner/Administrator/Operator; view = +
 * ReadOnlyAuditor; everyone else denied (deny-by-default). The public
 * accountability report is a separate, unauthenticated controller.
 */
@Controller('campaigns/:campaignId/evidences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignEvidencesController {
  constructor(private readonly service: CampaignEvidencesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body(new ZodValidationPipe(createCampaignEvidenceSchema)) dto: CreateCampaignEvidenceInput,
  ): Promise<CampaignEvidenceUploadResult> {
    return this.service.create(actor.id, campaignId, dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<CampaignEvidence>> {
    return this.service.list(campaignId, Number(limit), Number(offset));
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCampaignEvidenceSchema)) dto: UpdateCampaignEvidenceInput,
  ): Promise<CampaignEvidence> {
    return this.service.update(actor.id, campaignId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...WRITE_ROLES)
  async remove(
    @CurrentUser() actor: RequestUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(actor.id, campaignId, id);
  }
}
