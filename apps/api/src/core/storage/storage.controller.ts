import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  PayloadTooLargeException,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Role } from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestUser } from '../auth/auth.types';
import { STORAGE_PORT, type StoragePort } from './storage.port';
import { ALLOWED_CONTENT_TYPES, parseStorageKey } from './storage-keys';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Serves file bytes THROUGH the API (T-108) so access control runs before any
 * byte leaves the server — files live outside the webroot with unguessable keys.
 *
 *   PUT  /storage/upload?key=…   → JWT; upload only to your OWN org's key; size +
 *                                  type validated; audited.
 *   GET  /storage/public?key=…   → open (animal photos, org logos).
 *   GET  /storage/private?key=…  → JWT; only the OWNING org's Owner or a Platform
 *                                  admin; every download audited (UTC).
 *
 * Guards are per-method (the public GET has none). The key carries its own
 * visibility + org, validated on every request; a wrong org/role → 403/404.
 */
@Controller('storage')
export class StorageController {
  private readonly maxBytes: number;
  private readonly maxMb: number;

  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
    this.maxBytes = this.maxMb * 1024 * 1024;
  }

  private async rolesOf(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany({ where: { userId } }));
    return new Set(rows.map((row) => row.role));
  }

  @Put('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: RequestUser,
    @Query('key') key: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<{ key: string; url: string }> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed) {
      throw new BadRequestException('Invalid storage key');
    }
    // You can only upload bytes to a key reserved for YOUR organization.
    if (user.organizationId !== parsed.organizationId) {
      throw new ForbiddenException('Cannot upload to another organization');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required (multipart field "file")');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${this.maxMb} MB limit`);
    }
    if (!ALLOWED_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported content type: ${file.mimetype}`);
    }

    await this.storage.saveObject(key, file.buffer, file.mimetype);
    await this.audit.record({
      organizationId: parsed.organizationId,
      actorUserId: user.id,
      action: 'storage.uploaded',
      entityType: 'storage_object',
      entityId: key,
      metadata: { visibility: parsed.visibility },
    });
    return { key, url: this.storage.resolvePublicUrl(key) };
  }

  @Get('public')
  async servePublic(@Query('key') key: string, @Res() res: Response): Promise<void> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed || parsed.visibility !== 'public') {
      throw new NotFoundException();
    }
    const object = await this.storage.readObject(key);
    if (!object) {
      throw new NotFoundException();
    }
    res.setHeader('Content-Type', object.contentType ?? 'application/octet-stream');
    res.send(object.data);
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  async servePrivate(
    @CurrentUser() user: RequestUser,
    @Query('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = parseStorageKey(key ?? '');
    if (!parsed || parsed.visibility !== 'private') {
      throw new NotFoundException();
    }
    // Legal/clinical documents: only the OWNING org's Owner, or a platform admin.
    const roles = await this.rolesOf(user.id);
    const isPlatform = roles.has(Role.PlatformAdmin) || roles.has(Role.PlatformSuperAdmin);
    const isOwnerOfOwningOrg =
      user.organizationId === parsed.organizationId && roles.has(Role.Owner);
    if (!isPlatform && !isOwnerOfOwningOrg) {
      throw new ForbiddenException('Not allowed to download this document');
    }

    const object = await this.storage.readObject(key);
    if (!object) {
      throw new NotFoundException();
    }
    // Audit the access under the OWNING org (who downloaded which object), UTC,
    // no content — only the object id + visibility.
    await this.audit.record({
      organizationId: parsed.organizationId,
      actorUserId: user.id,
      action: 'storage.document_downloaded',
      entityType: 'storage_object',
      entityId: key,
      metadata: { visibility: 'private' },
    });
    res.setHeader('Content-Type', object.contentType ?? 'application/octet-stream');
    res.send(object.data);
  }
}
