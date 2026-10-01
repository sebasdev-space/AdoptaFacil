import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PORTAL_BANNER_MAX_PHOTOS,
  type CreatePortalBannerPhotoInput,
  type PortalBannerPhoto,
  type PortalBannerUploadTarget,
  type PortalBannerUploadTargetInput,
  type PublicPortalBanner,
  type ReorderPortalBannerInput,
  type UpdatePortalBannerPhotoInput,
} from '@adoptafacil/contracts';
import type { PortalBannerPhoto as PortalBannerPhotoRow } from '@prisma/client';
import { AuditService } from '../../core/audit/audit.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { contentTypeFromKey, parseStorageKey } from '../../core/storage/storage-keys';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BANNER_CONTENT_TYPES, BANNER_MAX_BYTES } from './portal-banner.schemas';

const LOCK_KEY = 'portal_banner_photos';

/**
 * Banner (hero) del portal general `/` (M14). `portal_banner_photos` es una tabla
 * GLOBAL de plataforma (sin organization_id ni RLS, como `platform_settings`):
 * la escritura está gateada a PlatformAdmin/PlatformSuperAdmin en el controller y
 * cada cambio se audita (UTC) bajo la organización del admin actuante. La lectura
 * pública proyecta SOLO id + imagen + alt de las filas activas. Los bytes viven
 * en StoragePort con visibilidad `public`, en la carpeta de la org del admin.
 */
@Injectable()
export class PortalBannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private toPhoto(row: PortalBannerPhotoRow): PortalBannerPhoto {
    return {
      id: row.id,
      position: row.position,
      storageKey: row.storageRef,
      imageUrl: this.storage.resolvePublicUrl(row.storageRef),
      altText: row.altText,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** PUBLIC read (no auth): active photos only, ordered, minimal columns. */
  async getPublic(): Promise<PublicPortalBanner> {
    const rows = await this.prisma.portalBannerPhoto.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, storageRef: true, altText: true },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        imageUrl: this.storage.resolvePublicUrl(row.storageRef),
        altText: row.altText,
      })),
    };
  }

  /** Admin list (active and inactive), ordered. */
  async list(): Promise<PortalBannerPhoto[]> {
    const rows = await this.prisma.portalBannerPhoto.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toPhoto(row));
  }

  /** Reserve a PUBLIC upload key (the client then PUTs to /storage/upload). */
  async createUploadTarget(
    input: PortalBannerUploadTargetInput,
  ): Promise<PortalBannerUploadTarget> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
      visibility: 'public',
    });
    return { key: stored.key, url: stored.url };
  }

  /** Register an already-uploaded photo in the next free slot (max 4). */
  async create(
    actorUserId: string,
    input: CreatePortalBannerPhotoInput,
  ): Promise<PortalBannerPhoto> {
    const organizationId = this.requireOrgId();
    const parsed = parseStorageKey(input.storageKey);
    if (!parsed || parsed.visibility !== 'public' || parsed.organizationId !== organizationId) {
      throw new BadRequestException('Invalid storage key');
    }
    const contentType = contentTypeFromKey(input.storageKey);
    if (!(BANNER_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new BadRequestException('Unsupported image type (use JPG, PNG or WebP)');
    }
    const object = await this.storage.readObject(input.storageKey);
    if (!object) {
      throw new BadRequestException('The image has not been uploaded yet');
    }
    if (object.data.length > BANNER_MAX_BYTES) {
      throw new BadRequestException('The image exceeds the 5 MB limit');
    }

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
      const existing = await tx.portalBannerPhoto.findMany({ select: { position: true } });
      if (existing.length >= PORTAL_BANNER_MAX_PHOTOS) {
        throw new ConflictException(`The banner holds at most ${PORTAL_BANNER_MAX_PHOTOS} photos`);
      }
      const used = new Set(existing.map((row) => row.position));
      let position = 0;
      while (used.has(position)) position += 1;
      const row = await tx.portalBannerPhoto.create({
        data: {
          position,
          storageRef: input.storageKey,
          altText: input.altText,
          createdByUserId: actorUserId,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal_banner.photo_added',
        entityType: 'portal_banner_photo',
        entityId: row.id,
        metadata: { position },
      });
      return this.toPhoto(row);
    });
  }

  /** Edit alt text and/or toggle active. */
  async update(
    actorUserId: string,
    id: string,
    input: UpdatePortalBannerPhotoInput,
  ): Promise<PortalBannerPhoto> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.portalBannerPhoto.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Banner photo not found');
      }
      const row = await tx.portalBannerPhoto.update({
        where: { id },
        data: {
          ...(input.altText !== undefined ? { altText: input.altText } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal_banner.photo_updated',
        entityType: 'portal_banner_photo',
        entityId: id,
        metadata: {
          altTextChanged: input.altText !== undefined && input.altText !== current.altText,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      return this.toPhoto(row);
    });
  }

  /** Reorder: `ids` must be EXACTLY the current set, in the new order. */
  async reorder(
    actorUserId: string,
    input: ReorderPortalBannerInput,
  ): Promise<PortalBannerPhoto[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
      const current = await tx.portalBannerPhoto.findMany({ select: { id: true } });
      const currentIds = new Set(current.map((row) => row.id));
      const sameSet =
        input.ids.length === currentIds.size &&
        new Set(input.ids).size === input.ids.length &&
        input.ids.every((id) => currentIds.has(id));
      if (!sameSet) {
        throw new BadRequestException('ids must list every banner photo exactly once');
      }
      for (const [position, id] of input.ids.entries()) {
        await tx.portalBannerPhoto.update({ where: { id }, data: { position } });
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal_banner.reordered',
        entityType: 'portal_banner_photo',
        metadata: { order: input.ids },
      });
      const rows = await tx.portalBannerPhoto.findMany({ orderBy: { position: 'asc' } });
      return rows.map((row) => this.toPhoto(row));
    });
  }

  /** Delete a photo and compact the remaining positions. */
  async remove(actorUserId: string, id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
      const current = await tx.portalBannerPhoto.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Banner photo not found');
      }
      await tx.portalBannerPhoto.delete({ where: { id } });
      const rest = await tx.portalBannerPhoto.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, position: true },
      });
      for (const [position, row] of rest.entries()) {
        if (row.position !== position) {
          await tx.portalBannerPhoto.update({ where: { id: row.id }, data: { position } });
        }
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal_banner.photo_removed',
        entityType: 'portal_banner_photo',
        entityId: id,
        metadata: { position: current.position },
      });
    });
  }
}
