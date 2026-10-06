import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ClinicalEvent as EventRow,
  ClinicalEventAttachment as AttachmentRow,
} from '@prisma/client';
import {
  type ClinicalAttachment,
  type ClinicalAttachmentUploadTarget,
  type ClinicalEvent,
  type ClinicalEventDetails,
  type ClinicalEventType,
  type CreateClinicalEventInput,
  type EditClinicalEventInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { buildNextVersion } from './clinical-version';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';

type EventWithAttachments = EventRow & { attachments: AttachmentRow[] };

@Injectable()
export class ClinicalService {
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

  private toAttachment(row: AttachmentRow): ClinicalAttachment {
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
    };
  }

  private toEvent(row: EventWithAttachments): ClinicalEvent {
    return {
      id: row.id,
      eventId: row.eventId,
      organizationId: row.organizationId,
      animalId: row.animalId,
      type: row.type as ClinicalEventType,
      occurredAt: row.occurredAt.toISOString(),
      nextDueDate: row.nextDueDate?.toISOString(),
      details: (row.details as ClinicalEventDetails) ?? {},
      version: row.version,
      authorUserId: row.authorUserId,
      attachments: [...row.attachments]
        .sort((a, b) => a.order - b.order)
        .map((a) => this.toAttachment(a)),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Reserve a storage target for ONE clinical attachment (fix,
   *  T-ANIMALS-ATTACHMENTS-AUDIT) — private object (exam results, vaccination
   *  proof, evidence photos are never shown in the public catalog). The
   *  client PUTs the bytes to the returned `url`, then passes `key` back as
   *  `storageRef` in the create/edit call. */
  async reserveAttachmentUpload(input: {
    filename: string;
    contentType?: string;
  }): Promise<ClinicalAttachmentUploadTarget> {
    const organizationId = this.requireOrgId();
    return this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
    });
  }

  /** Map ALREADY-uploaded attachments (each `storageRef` was reserved via
   *  `reserveAttachmentUpload` and its bytes PUT before this call) into
   *  Prisma create-data. Unlike the old `filename`-only shape, this never
   *  mints a storage key that nothing was ever uploaded to. */
  private toAttachmentCreateData(
    organizationId: string,
    attachments: { storageRef: string; order?: number }[] | undefined,
    startOrder: number,
  ): { organizationId: string; storageRef: string; order: number }[] {
    return (attachments ?? []).map((a, index) => ({
      organizationId,
      storageRef: a.storageRef,
      order: a.order ?? startOrder + index,
    }));
  }

  private async assertAnimal(tx: Prisma.TransactionClient, animalId: string): Promise<void> {
    const animal = await tx.animal.findUnique({ where: { id: animalId } });
    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
  }

  /** Create a clinical event (version 1). Owner/Administrator/Operator/
   *  Veterinarian (enforced in the controller; fix, previously Veterinarian
   *  only). Records the author + a UTC audit event WITHOUT the clinical
   *  detail (Ley 1581/1774). */
  async create(
    actorUserId: string,
    animalId: string,
    input: CreateClinicalEventInput,
  ): Promise<ClinicalEvent> {
    const organizationId = this.requireOrgId();
    const attachments = this.toAttachmentCreateData(organizationId, input.attachments, 0);
    const eventId = randomUUID();

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertAnimal(tx, animalId);
      const row = await tx.clinicalEvent.create({
        data: {
          eventId,
          organizationId,
          animalId,
          type: input.type,
          occurredAt: new Date(input.occurredAt),
          nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
          details: (input.details ?? {}) as Prisma.InputJsonValue,
          version: 1,
          authorUserId: actorUserId,
          attachments: attachments.length > 0 ? { create: attachments } : undefined,
        },
        include: { attachments: true },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.clinical_event_created',
        entityType: 'clinical_event',
        entityId: eventId,
        // NEVER the clinical detail — only the action + non-sensitive metadata.
        metadata: { type: input.type, version: 1, attachments: attachments.length },
      });

      return this.toEvent(row);
    });
  }

  /** Edit a clinical event → NEW version (Owner/Administrator/Operator/
   *  Veterinarian; fix, previously Veterinarian only). The previous version
   *  stays immutable with its original author. Prior attachments carry
   *  forward; any new ones are appended. */
  async edit(
    actorUserId: string,
    animalId: string,
    eventId: string,
    input: EditClinicalEventInput,
  ): Promise<ClinicalEvent> {
    const organizationId = this.requireOrgId();

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const latest = await tx.clinicalEvent.findFirst({
        where: { eventId, animalId, organizationId },
        orderBy: { version: 'desc' },
        include: { attachments: true },
      });
      if (!latest) {
        throw new NotFoundException('Clinical event not found');
      }

      const next = buildNextVersion(
        {
          type: latest.type as ClinicalEventType,
          occurredAt: latest.occurredAt,
          nextDueDate: latest.nextDueDate,
          details: (latest.details as Record<string, unknown>) ?? {},
          version: latest.version,
        },
        {
          type: input.type,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : undefined,
          details: input.details,
        },
      );

      // Carry forward prior attachments (self-contained immutable snapshot), then
      // append any newly reserved ones after them.
      const carried = latest.attachments.map((a) => ({
        organizationId,
        storageRef: a.storageRef,
        order: a.order,
      }));
      const added = this.toAttachmentCreateData(organizationId, input.attachments, carried.length);
      const attachments = [...carried, ...added];

      const row = await tx.clinicalEvent.create({
        data: {
          eventId,
          organizationId,
          animalId,
          type: next.type,
          occurredAt: next.occurredAt,
          nextDueDate: next.nextDueDate,
          details: next.details as Prisma.InputJsonValue,
          version: next.version,
          authorUserId: actorUserId,
          attachments: attachments.length > 0 ? { create: attachments } : undefined,
        },
        include: { attachments: true },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.clinical_event_versioned',
        entityType: 'clinical_event',
        entityId: eventId,
        metadata: { type: next.type, version: next.version, attachmentsAdded: added.length },
      });

      return this.toEvent(row);
    });
  }

  /** Current (highest) version of each clinical event of an animal. */
  async listCurrent(animalId: string): Promise<ClinicalEvent[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.clinicalEvent.findMany({
        where: { animalId, organizationId },
        orderBy: { version: 'desc' },
        include: { attachments: true },
      }),
    );
    const currentByEvent = new Map<string, EventWithAttachments>();
    for (const row of rows) {
      if (!currentByEvent.has(row.eventId)) {
        currentByEvent.set(row.eventId, row);
      }
    }
    return [...currentByEvent.values()]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((row) => this.toEvent(row));
  }

  /** Full version history of one clinical event, oldest first (each immutable). */
  async history(animalId: string, eventId: string): Promise<ClinicalEvent[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.clinicalEvent.findMany({
        where: { eventId, animalId, organizationId },
        orderBy: { version: 'asc' },
        include: { attachments: true },
      }),
    );
    if (rows.length === 0) {
      throw new NotFoundException('Clinical event not found');
    }
    return rows.map((row) => this.toEvent(row));
  }
}
