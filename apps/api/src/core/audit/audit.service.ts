import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLog as AuditLogRow } from '@prisma/client';
import type { AuditEvent, AuditEventInput } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Metadata keys that must never be persisted in clear (defense in depth — the
 *  caller should not pass secrets in the first place). */
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|credential|refresh|otp|api[-_]?key/i;

const REDACTED = '[REDACTED]';

function toAuditEvent(row: AuditLogRow): AuditEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Records append-only audit events (RNF04). Reusable by any module: call
 * {@link record} for a standalone event, or {@link recordWithTx} to write the
 * event atomically inside an existing tenant transaction (so the audit entry
 * commits together with the action it describes). The audit table is immutable
 * and tenant-isolated at the database level; this service adds a defensive
 * redaction of known-sensitive metadata keys.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Redact known-sensitive top-level metadata keys. */
  private sanitize(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata) {
      return {};
    }
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      clean[key] = SENSITIVE_KEY.test(key) ? REDACTED : value;
    }
    return clean;
  }

  /** Persist an event using an existing transaction (atomic with the action). */
  async recordWithTx(tx: Prisma.TransactionClient, input: AuditEventInput): Promise<AuditEvent> {
    const row = await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: this.sanitize(input.metadata) as unknown as Prisma.InputJsonValue,
      },
    });
    return toAuditEvent(row);
  }

  /** Persist an event in its own transaction, scoped to the event's org. */
  async record(input: AuditEventInput): Promise<AuditEvent> {
    return this.prisma.withOrgContext(input.organizationId, (tx) => this.recordWithTx(tx, input));
  }
}
