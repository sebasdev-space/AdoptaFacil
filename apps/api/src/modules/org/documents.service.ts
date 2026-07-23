import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Prisma, OrganizationDocument as DocumentRow } from '@prisma/client';
import {
  DocumentStatus,
  DocumentType,
  type OrganizationDocument,
  type UploadOrganizationDocumentInput,
  type UploadOrganizationDocumentResult,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  VERIFICATION_LEVELS,
  computeVerificationLevel,
  effectiveStatus,
  satisfiedDocumentTypes,
  type DocumentSnapshot,
} from './verification';

/** Map a DB row to the contract shape, presenting the EFFECTIVE status (an
 *  Approved-but-past-`expiresAt` document is shown as Expired). */
function toDocument(row: DocumentRow, now: Date): OrganizationDocument {
  const stored = row.status as DocumentStatus;
  const status = effectiveStatus(stored, row.expiresAt, now);
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type as DocumentType,
    storageRef: row.storageRef,
    version: row.version,
    issuedAt: row.issuedAt?.toISOString(),
    expiresAt: row.expiresAt?.toISOString(),
    status,
    reviewNote: row.reviewNote ?? undefined,
    reviewedByUserId: row.reviewedByUserId ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Org-side document management (M01, RF03), tenant-scoped via RLS. Uploading a
 * new version never overwrites older ones (append a row with the next version);
 * verification levels are computed from Approved & current documents. The
 * platform review flow lives in {@link PlatformDocumentsService} (cross-tenant).
 */
@Injectable()
export class DocumentsService {
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

  /** Upload a new document version (Owner/Administrator). Reserves a simulable
   *  storage target, appends the next version (status Pending) and audits it —
   *  all in one RLS-scoped transaction. Content is never logged (Ley 1581). */
  async upload(
    actorUserId: string,
    input: UploadOrganizationDocumentInput,
  ): Promise<UploadOrganizationDocumentResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
    });

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const latest = await tx.organizationDocument.aggregate({
        where: { organizationId, type: input.type },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;

      const row = await tx.organizationDocument.create({
        data: {
          organizationId,
          type: input.type,
          storageRef: stored.key,
          version,
          status: DocumentStatus.Pending,
          issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.document_uploaded',
        entityType: 'organization_document',
        entityId: row.id,
        // Metadata only — never the document content or storage bytes.
        metadata: { type: input.type, version },
      });

      return {
        document: toDocument(row, new Date()),
        upload: { url: stored.url, key: stored.key },
      };
    });
  }

  /** All documents of the caller's org, newest version first per type. Any
   *  authorized viewer (Owner/Administrator/ReadOnlyAuditor) may read. */
  async list(): Promise<OrganizationDocument[]> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationDocument.findMany({
        where: { organizationId },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      }),
    );
    return rows.map((row) => toDocument(row, now));
  }

  /** Verification level computed live from the org's Approved & current
   *  documents (a vencido document blocks its tier until renewed). */
  async getVerification(): Promise<VerificationLevel> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationDocument.findMany({ where: { organizationId } }),
    );
    return computeVerificationLevel(rows.map(toSnapshot), VERIFICATION_LEVELS, now);
  }

  /** Document types Approved & vigente for an org, computed inside an existing
   *  tenant transaction. Used by the formalization machine to gate advances. */
  async satisfiedTypesInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<DocumentType[]> {
    const rows = await tx.organizationDocument.findMany({ where: { organizationId } });
    return [...satisfiedDocumentTypes(rows.map(toSnapshot), now)];
  }
}

function toSnapshot(row: DocumentRow): DocumentSnapshot {
  return {
    type: row.type as DocumentType,
    status: row.status as DocumentStatus,
    expiresAt: row.expiresAt,
  };
}
