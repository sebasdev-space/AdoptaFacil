import { Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
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
import { STORAGE_PORT, type StoragePort, type StoredObject } from '../../core/storage/storage.port';
import { PlatformSettingsService } from './platform-settings.service';
import { updatePlatformSettingsSchema } from './platform-settings.schemas';
import { uploadTargetSchema } from './org.schemas';

interface UploadTargetDto {
  filename: string;
  contentType?: string;
}

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
  constructor(
    private readonly service: PlatformSettingsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

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

  /** Reserve a storage target for ONE hero banner photo (S-15). Same
   *  reserve-then-PUT flow already used by `OrgController.createUpload` for
   *  logos/cover photos — `PUT /storage/upload` only allows uploading bytes
   *  to a key reserved for your OWN organization, so this reserves under the
   *  acting PlatformAdmin's own org (irrelevant to this platform-wide
   *  setting beyond being the storage path's namespace). */
  @Post('uploads')
  createUpload(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadTargetSchema)) dto: UploadTargetDto,
  ): Promise<StoredObject> {
    return this.storage.createUploadTarget({
      organizationId: actor.organizationId,
      filename: dto.filename,
      contentType: dto.contentType,
      visibility: 'public',
    });
  }
}
