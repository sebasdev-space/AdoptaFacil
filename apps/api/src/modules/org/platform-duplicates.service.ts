import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OrganizationDuplicateFlag,
  ReviewOrganizationDuplicateInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

const DECISION_STATUS: Record<ReviewOrganizationDuplicateInput['decision'], string> = {
  dismiss: 'dismissed',
  confirm: 'confirmed',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cross-tenant platform review of flagged possible duplicate organizations
 * (M01, S-3). Same pattern as `PlatformDocumentsService`: bounded SECURITY
 * DEFINER functions (`platform_duplicate_flag_queue`,
 * `platform_duplicate_flag_decide`) are the ONLY cross-tenant path — access is
 * gated to platform roles at the controller.
 */
@Injectable()
export class PlatformDuplicatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pending duplicate flags across all organizations, oldest first. */
  async queue(): Promise<OrganizationDuplicateFlag[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: OrganizationDuplicateFlag[] | null }>>(
      Prisma.sql`SELECT platform_duplicate_flag_queue() AS data`,
    );
    return rows[0]?.data ?? [];
  }

  /** Dismiss ("no es duplicado") or confirm a flag. This only records the
   *  decision — it never takes any automatic action on either organization
   *  (TODO(client): the base document does not define what happens
   *  operationally after a confirmed duplicate). */
  async decide(
    reviewerUserId: string,
    flagId: string,
    input: ReviewOrganizationDuplicateInput,
  ): Promise<OrganizationDuplicateFlag> {
    if (!UUID_RE.test(flagId)) {
      throw new BadRequestException('Invalid duplicate flag id');
    }
    const status = DECISION_STATUS[input.decision];

    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: OrganizationDuplicateFlag }>>(
        Prisma.sql`SELECT platform_duplicate_flag_decide(${flagId}::uuid, ${status}, ${reviewerUserId}::uuid) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate flag not found/i.test(message)) {
        throw new NotFoundException('Duplicate flag not found');
      }
      if (/already decided/i.test(message)) {
        throw new BadRequestException('This duplicate flag has already been decided.');
      }
      throw error;
    }
  }
}
