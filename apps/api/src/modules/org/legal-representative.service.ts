import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { LegalRepresentative as LegalRepresentativeRow } from '@prisma/client';
import {
  type LegalRepresentative,
  type LegalRepresentativeDocumentType,
  type LegalRepresentativeRole,
  type LegalRepresentativeStatus,
  type RegisterLegalRepresentativeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  LEGAL_REPRESENTATIVE_CONFIG,
  decryptSignature,
  encryptSignature,
  hashSignature,
  type LegalRepresentativeConfig,
} from './legal-representative-crypto';

/** The CURRENT legal representative's public identity + DECRYPTED signature
 *  image bytes — for another module to print on an official document (e.g.
 *  M08's volunteer certificate). Never the encrypted payload nor the key. */
export interface LegalRepresentativeSigner {
  fullName: string;
  position: string;
  /** Raw image bytes (PNG, from `SignaturePad`'s canvas export) — ready to
   *  embed directly in a PDF via `pdf-lib`'s `embedPng`. */
  signatureImage: Buffer;
}

function toContract(row: LegalRepresentativeRow): LegalRepresentative {
  return {
    id: row.id,
    organizationId: row.organizationId,
    memberId: row.memberId,
    role: row.role as LegalRepresentativeRole,
    fullName: row.fullName,
    documentType: row.documentType as LegalRepresentativeDocumentType,
    documentNumber: row.documentNumber,
    position: row.position,
    signatureFileRef: row.signatureFileRef,
    signatureHash: row.signatureHash,
    status: row.status as LegalRepresentativeStatus,
    signedAt: row.signedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M01 legal representative signature (S-1, RF14 relacionado / RNF10),
 * tenant-scoped via RLS. `legal_representatives` is append-only (DB-enforced,
 * see the migration): registering again never mutates the previous row — it
 * inserts a new one, and "vigente" is always the most recently `signedAt`
 * record for the organization, computed here at read time.
 */
@Injectable()
export class LegalRepresentativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(LEGAL_REPRESENTATIVE_CONFIG) private readonly config: LegalRepresentativeConfig,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Register (or re-register, e.g. a change of representative/accountant/
   * fiscal reviewer) the CALLER's own signature UNDER `input.role`. `memberId`
   * is ALWAYS the authenticated actor, never a client-supplied id — combined
   * with the controller's `@Roles(Role.Owner)` gate, this makes "only the
   * Owner can create/update THEIR OWN signature" structurally true rather
   * than an extra check to remember.
   *
   * Requerimiento #16: registering a role never replaces another role's
   * current record — "vigente" is scoped to `(organizationId, role)`, so an
   * org can keep a legal representative, an accountant, AND a fiscal reviewer
   * all current at once, each independently re-signable.
   *
   * The signature is encrypted (AES-256-GCM) BEFORE it ever reaches
   * StoragePort — no plaintext bytes are written anywhere, not even
   * transiently — and only its SHA-256 hash + the encrypted file's opaque key
   * are persisted. Audit metadata never includes the signature content.
   */
  async register(
    actorUserId: string,
    input: RegisterLegalRepresentativeInput,
  ): Promise<LegalRepresentative> {
    const organizationId = this.requireOrgId();

    const plaintext = Buffer.from(input.signatureBase64, 'base64');
    if (plaintext.length === 0) {
      throw new BadRequestException('La firma está vacía o no es una imagen válida.');
    }

    const signatureHash = hashSignature(plaintext);
    const encrypted = encryptSignature(plaintext, this.config.signatureEncryptionKey);

    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: 'signature.enc',
      visibility: 'private',
    });
    await this.storage.saveObject(stored.key, encrypted, 'application/octet-stream');

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const signedAt = new Date();
      const row = await tx.legalRepresentative.create({
        data: {
          organizationId,
          memberId: actorUserId,
          role: input.role,
          fullName: input.fullName.trim(),
          documentType: input.documentType,
          documentNumber: input.documentNumber.trim(),
          position: input.position.trim(),
          signatureFileRef: stored.key,
          signatureHash,
          signedAt,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.legal_representative_registered',
        entityType: 'legal_representative',
        entityId: row.id,
        // Metadata only — NEVER the signature bytes/content, only identifiers.
        metadata: { role: row.role, fullName: row.fullName, position: row.position },
      });

      return toContract(row);
    });
  }

  /** The CURRENT (most recently signed) record for EACH role the caller's org
   *  has ever registered — at most one entry per role, never empty slots for
   *  roles nobody has registered yet (requerimiento #16). */
  async getAllCurrent(): Promise<LegalRepresentative[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const latestPerRole = await tx.legalRepresentative.groupBy({
        by: ['role'],
        where: { organizationId },
        _max: { signedAt: true },
      });
      if (latestPerRole.length === 0) {
        return [];
      }
      const rows = await tx.legalRepresentative.findMany({
        where: {
          organizationId,
          OR: latestPerRole.map((group) => ({
            role: group.role,
            signedAt: group._max.signedAt ?? undefined,
          })),
        },
        orderBy: { role: 'asc' },
      });
      return rows.map(toContract);
    });
  }

  /**
   * Same lookup as {@link getAllCurrent}, scoped to ONE role, but by an
   * EXPLICIT `organizationId` instead of the caller's own tenant context —
   * for a cross-module reader that renders ANOTHER organization's official
   * document (e.g. M08's volunteer certificate, viewed by the cross-tenant
   * volunteer themselves, who has no tenant context matching the issuing
   * org). Also decrypts the signature image here, so the encryption key never
   * leaves this service. Defaults to `'legal_representative'` — the only role
   * that existed before requerimiento #16 — so existing callers don't need to
   * change.
   *
   * Returns `null` — never throws — when no signer of that role has been
   * registered, or if the stored bytes fail to decrypt (tampered/corrupted):
   * a broken signature must never take down certificate generation; the
   * caller falls back to a generic "Representante Legal" placeholder.
   */
  async getCurrentSignerForOrg(
    organizationId: string,
    role: LegalRepresentativeRole = 'legal_representative',
  ): Promise<LegalRepresentativeSigner | null> {
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.legalRepresentative.findFirst({
        where: { organizationId, role },
        orderBy: { signedAt: 'desc' },
      }),
    );
    if (!row) {
      return null;
    }

    const stored = await this.storage.readObject(row.signatureFileRef);
    if (!stored) {
      return null;
    }

    try {
      const signatureImage = decryptSignature(stored.data, this.config.signatureEncryptionKey);
      return { fullName: row.fullName, position: row.position, signatureImage };
    } catch {
      return null;
    }
  }
}
