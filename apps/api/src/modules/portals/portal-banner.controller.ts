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
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Role,
  type CreatePortalBannerPhotoInput,
  type PortalBannerPhoto,
  type PortalBannerUploadTarget,
  type PortalBannerUploadTargetInput,
  type PublicPortalBanner,
  type ReorderPortalBannerInput,
  type UpdatePortalBannerPhotoInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PortalBannerService } from './portal-banner.service';
import {
  bannerUploadTargetSchema,
  createBannerPhotoSchema,
  reorderBannerSchema,
  updateBannerPhotoSchema,
} from './portal-banner.schemas';

/** PUBLIC read of the general-portal banner — no auth, rate-limited, minimal
 *  projection (active photos: id + image URL + alt). */
@Controller('public/portal-banner')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicPortalBannerController {
  constructor(private readonly banner: PortalBannerService) {}

  @Get()
  get(): Promise<PublicPortalBanner> {
    return this.banner.getPublic();
  }
}

/** Banner administration — platform roles ONLY (deny-by-default). */
@Controller('platform/portal-banner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformPortalBannerController {
  constructor(private readonly banner: PortalBannerService) {}

  @Get()
  list(): Promise<PortalBannerPhoto[]> {
    return this.banner.list();
  }

  @Post('upload-target')
  uploadTarget(
    @Body(new ZodValidationPipe(bannerUploadTargetSchema)) dto: PortalBannerUploadTargetInput,
  ): Promise<PortalBannerUploadTarget> {
    return this.banner.createUploadTarget(dto);
  }

  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createBannerPhotoSchema)) dto: CreatePortalBannerPhotoInput,
  ): Promise<PortalBannerPhoto> {
    return this.banner.create(actor.id, dto);
  }

  // Declared BEFORE `:id` routes so "order" is never parsed as a UUID.
  @Put('order')
  reorder(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(reorderBannerSchema)) dto: ReorderPortalBannerInput,
  ): Promise<PortalBannerPhoto[]> {
    return this.banner.reorder(actor.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBannerPhotoSchema)) dto: UpdatePortalBannerPhotoInput,
  ): Promise<PortalBannerPhoto> {
    return this.banner.update(actor.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.banner.remove(actor.id, id);
  }
}
