import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type DocumentReviewQueueItem,
  type OrganizationDocument,
  type ReviewOrganizationDocumentInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentsService } from './documents.service';

/** Map the review decision verb to the stored status it produces. */
const DECISION_STATUS: Record<ReviewOrganizationDocumentInput['decision'], string> = {
  observe: 'observed',
  approve: 'approved',
  reject: 'rejected',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cross-tenant platform document review (M01, RF03). Reviewers act ACROSS
 * organizations, so this service NEVER reads/writes another org's rows through
 * the tenant RLS path (which would return nothing for the reviewer's own
 * context). Instead it calls bounded SECURITY DEFINER functions
 * (`platform_document_queue`, `platform_document_decide`) that run as their owner
 * and expose only the necessary columns. Access is gated to platform roles at
 * the controller — these functions are the only cross-tenant path and are never
 * reachable by an org role.
 */
@Injectable()
export class PlatformDocumentsService {
  private readonly logger = new Logger('PlatformDocuments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  /** Pending/UnderReview documents across all organizations, oldest first. */
  async queue(): Promise<DocumentReviewQueueItem[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: DocumentReviewQueueItem[] | null }>>(
      Prisma.sql`SELECT platform_document_queue() AS data`,
    );
    return rows[0]?.data ?? [];
  }

  /** Apply a review decision (observe/approve/reject) to one document. The
   *  document update + audit event are atomic in the DEFINER function, under the
   *  DOCUMENT's org. A reason is mandatory for observe/reject (validated by the
   *  schema and re-enforced in the function). */
  async decide(
    reviewerUserId: string,
    documentId: string,
    input: ReviewOrganizationDocumentInput,
  ): Promise<OrganizationDocument> {
    if (!UUID_RE.test(documentId)) {
      throw new BadRequestException('Invalid document id');
    }
    const status = DECISION_STATUS[input.decision];
    const note = input.note?.trim() ? input.note.trim() : null;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: OrganizationDocument }>>(
        Prisma.sql`SELECT platform_document_decide(${documentId}::uuid, ${status}, ${reviewerUserId}::uuid, ${note}) AS data`,
      );
      const decided = rows[0].data;

      // S1-05: recompute the org's verification level now that a document
      // decision may have changed which documents count as approved. Runs
      // cross-tenant (the reviewer is not a member of the document's org) via
      // the same explicit-org accessor seeds/jobs use. Best-effort: the
      // document decision above already committed and is audited by the
      // DEFINER function — a failure here must never revert or fail it.
      try {
        await this.prisma.withOrgContext(decided.organizationId, (tx) =>
          this.documents.recomputeAndPersistVerification(tx, decided.organizationId),
        );
      } catch (error) {
        this.logger.warn(
          `Verification recompute failed for org=${decided.organizationId} after deciding document=${documentId}: ${(error as Error).message}`,
        );
      }

      return decided;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/document not found/i.test(message)) {
        throw new NotFoundException('Document not found');
      }
      if (/already decided/i.test(message)) {
        throw new BadRequestException('This document has already been decided.');
      }
      if (/reason is required/i.test(message)) {
        throw new BadRequestException('A reason is required to observe or reject a document.');
      }
      throw error;
    }
  }
}
