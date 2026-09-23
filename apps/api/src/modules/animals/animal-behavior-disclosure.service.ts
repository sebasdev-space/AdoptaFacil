import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnimalBehaviorDisclosure as DisclosureRow } from '@prisma/client';
import {
  type AnimalBehaviorDisclosure,
  type ChildrenCompatibility,
  type CreateAnimalBehaviorDisclosureInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { computeDisclosureHash } from './animal-behavior-disclosure-hash';

function toContract(row: DisclosureRow): AnimalBehaviorDisclosure {
  return {
    id: row.id,
    organizationId: row.organizationId,
    animalId: row.animalId,
    declaredByUserId: row.declaredByUserId,
    signedByName: row.signedByName,
    reactivityNotes: row.reactivityNotes ?? undefined,
    biteHistory: row.biteHistory,
    biteHistoryDetail: row.biteHistoryDetail ?? undefined,
    childrenCompatibility: row.childrenCompatibility as ChildrenCompatibility,
    medicalConditionsRelevant: row.medicalConditionsRelevant ?? undefined,
    signatureHash: row.signatureHash,
    declaredAt: row.declaredAt.toISOString(),
  };
}

/**
 * M03 animal behavior disclosure (S-9, FSD v3.5 Doc 4 — "Safe Harbor" del
 * refugio, Art. 2353 inciso 2 C.C.), tenant-scoped via RLS. Same append-only
 * convention as `LegalRepresentativeService`: declaring again never mutates
 * the previous row — it inserts a new one, and "vigente" is always the most
 * recently `declaredAt` record for the animal, computed here at read time.
 *
 * CROSS-MODULE: M04's Placement engine (Fabián) reads the CURRENT disclosure
 * via the SECURITY DEFINER `animal_behavior_disclosure_current()` function
 * (see the migration), NOT through this service — it has no tenant/HTTP
 * context of its own when generating a comodato contract.
 */
@Injectable()
export class AnimalBehaviorDisclosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private async assertAnimal(tx: Prisma.TransactionClient, animalId: string): Promise<void> {
    const animal = await tx.animal.findUnique({ where: { id: animalId } });
    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
  }

  /**
   * Declare AND sign the animal's behavior disclosure in one atomic step (the
   * FSD's modal declares and signs together — there is no separate "sign
   * later" flow, so the row is fully immutable from the moment it exists).
   * The hash is computed server-side, over the canonical content, BEFORE the
   * insert — never trusted from the client.
   */
  async create(
    actorUserId: string,
    animalId: string,
    input: CreateAnimalBehaviorDisclosureInput,
  ): Promise<AnimalBehaviorDisclosure> {
    const organizationId = this.requireOrgId();

    const signatureHash = computeDisclosureHash({
      animalId,
      signedByName: input.signedByName,
      reactivityNotes: input.reactivityNotes ?? null,
      biteHistory: input.biteHistory,
      biteHistoryDetail: input.biteHistoryDetail ?? null,
      childrenCompatibility: input.childrenCompatibility,
      medicalConditionsRelevant: input.medicalConditionsRelevant ?? null,
      declaredByUserId: actorUserId,
    });

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertAnimal(tx, animalId);

      const row = await tx.animalBehaviorDisclosure.create({
        data: {
          organizationId,
          animalId,
          declaredByUserId: actorUserId,
          signedByName: input.signedByName,
          reactivityNotes: input.reactivityNotes,
          biteHistory: input.biteHistory,
          biteHistoryDetail: input.biteHistoryDetail,
          childrenCompatibility: input.childrenCompatibility,
          medicalConditionsRelevant: input.medicalConditionsRelevant,
          signatureHash,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.behavior_disclosure_declared',
        entityType: 'animal_behavior_disclosure',
        entityId: row.id,
        // Metadata only — never the medical/behavioral detail itself.
        metadata: { animalId, biteHistory: input.biteHistory },
      });

      return toContract(row);
    });
  }

  /** The CURRENT (most recently declared) disclosure for an animal, or `null`
   *  when none exists yet. */
  async getCurrent(animalId: string): Promise<AnimalBehaviorDisclosure | null> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animalBehaviorDisclosure.findFirst({
        where: { animalId, organizationId },
        orderBy: { declaredAt: 'desc' },
      }),
    );
    return row ? toContract(row) : null;
  }
}
