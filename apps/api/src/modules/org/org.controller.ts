import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type Organization,
  type OrganizationPublic,
  Role,
  type UpdateOrganizationProfileInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { OrgProfileService } from './org-profile.service';
import { updateOrgProfileSchema, uploadTargetSchema } from './org.schemas';
import { STORAGE_PORT, type StoragePort, type StoredObject } from './storage/storage.port';

interface UploadTargetDto {
  filename: string;
  contentType?: string;
}

/**
 * M01 organization endpoints. Internal profile read/write is authenticated and
 * tenant-scoped (RLS); editing requires Owner/Administrator. The public portal
 * read is deliberately unauthenticated and returns only public fields.
 */
@Controller()
export class OrgController {
  constructor(
    private readonly profiles: OrgProfileService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** The caller's own organization profile (any authenticated member). */
  @Get('org/profile')
  @UseGuards(JwtAuthGuard)
  getOwnProfile(): Promise<Organization> {
    return this.profiles.getOwnProfile();
  }

  /** Create/patch the org profile — Owner/Administrator only. */
  @Put('org/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  update(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updateOrgProfileSchema)) dto: UpdateOrganizationProfileInput,
  ): Promise<Organization> {
    return this.profiles.updateProfile(actor.id, dto);
  }

  /** Reserve a storage target for a logo/photo (simulable in Ola 1). The client
   *  then stores the returned URL via PUT /org/profile. Owner/Administrator only. */
  @Post('org/profile/uploads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  createUpload(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadTargetSchema)) dto: UploadTargetDto,
  ): Promise<StoredObject> {
    return this.storage.createUploadTarget({
      organizationId: actor.organizationId,
      filename: dto.filename,
      contentType: dto.contentType,
    });
  }

  /** PUBLIC portal view by slug — no auth, only public fields, never private
   *  data and never another org's data (single-slug lookup). */
  @Get('public/organizations/:slug')
  async getPublic(@Param('slug') slug: string): Promise<OrganizationPublic> {
    const organization = await this.profiles.getPublicBySlug(slug);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }
}
