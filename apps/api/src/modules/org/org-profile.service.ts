import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Organization as OrgRow, OrganizationProfile as ProfileRow } from '@prisma/client';
import {
  FormalizationState,
  type Organization,
  type OrganizationDuplicateWarning,
  type OrganizationExtendedContact,
  type OrganizationLocation,
  type OrganizationPublic,
  type OrganizationSocialLinks,
  type OrganizationType,
  type UpdateOrganizationProfileInput,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { DuplicateDetectionService } from './duplicate-detection.service';

/** Merge the registry row (organizations) with its profile into the full
 *  `Organization` contract shape. */
function toOrganization(org: OrgRow, profile: ProfileRow | null): Organization {
  return {
    id: org.id,
    name: org.name,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
    nit: profile?.nit ?? undefined,
    legalName: profile?.legalName ?? undefined,
    description: profile?.description ?? undefined,
    logoUrl: profile?.logoUrl ?? undefined,
    coverPhotos: profile?.coverPhotos ?? undefined,
    whatsapp: profile?.whatsapp ?? undefined,
    contactEmail: profile?.contactEmail ?? undefined,
    phone: profile?.phone ?? undefined,
    location: (profile?.location as OrganizationLocation | null) ?? undefined,
    socialLinks: (profile?.socialLinks as OrganizationSocialLinks | null) ?? undefined,
    aboutUs: profile?.aboutUs ?? undefined,
    extendedContact: (profile?.extendedContact as OrganizationExtendedContact | null) ?? undefined,
    subdomain: profile?.subdomain ?? undefined,
    slug: profile?.slug ?? undefined,
    formalizationState:
      (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
    rteVigente: profile?.rteVigente ?? false,
    verificationLevel: (profile?.verificationLevel as VerificationLevel | null) ?? undefined,
    organizationType: (profile?.organizationType as OrganizationType | null) ?? undefined,
  };
}

@Injectable()
export class OrgProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly duplicates: DuplicateDetectionService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** The caller's own organization profile (full contract). Any authenticated
   *  member of the org may read it; the profile row is RLS-scoped to the org. */
  async getOwnProfile(): Promise<Organization> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [org, profile] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      ]);
      return toOrganization(org, profile);
    });
  }

  /** Create/patch the caller's org profile (Owner/Administrator). Writes the
   *  profile (and the org name, if given) and records an audit event — all in
   *  one RLS-scoped transaction. */
  async updateProfile(
    actorUserId: string,
    input: UpdateOrganizationProfileInput,
  ): Promise<Organization> {
    const organizationId = this.requireOrgId();

    // S-3: NIT is a unique legal identifier (art. 125-3 ET) — a HARD block,
    // checked and (if blocked) audited BEFORE the write transaction below, so
    // the audit record survives even though the profile write never runs.
    const nit = input.nit?.trim();
    if (nit) {
      const nitConflict = await this.duplicates.findNitConflict(organizationId, nit);
      if (nitConflict) {
        await this.audit.record({
          organizationId,
          actorUserId,
          action: 'organization.duplicate_check_blocked',
          entityType: 'organization',
          entityId: organizationId,
          metadata: {
            matchType: 'exact_nit',
            matchedOrganizationId: nitConflict.organizationId,
          },
        });
        throw new ConflictException('Ya existe una organización registrada con este NIT.');
      }
    }

    // Fuzzy name match NEVER blocks — only warns + flags for review (S-3).
    // Computed before the transaction; persisted (flag rows) inside it, so
    // the flag only exists if the profile write itself actually commits.
    const name = input.name?.trim();
    const similarMatches = name ? await this.duplicates.findSimilarNames(organizationId, name) : [];

    const profileWrite = {
      nit: input.nit,
      legalName: input.legalName,
      description: input.description,
      logoUrl: input.logoUrl,
      coverPhotos: input.coverPhotos,
      whatsapp: input.whatsapp,
      contactEmail: input.contactEmail,
      phone: input.phone,
      subdomain: input.subdomain,
      slug: input.slug,
      organizationType: input.organizationType,
      aboutUs: input.aboutUs,
      ...(input.location !== undefined
        ? { location: input.location as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.socialLinks !== undefined
        ? { socialLinks: input.socialLinks as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.extendedContact !== undefined
        ? { extendedContact: input.extendedContact as unknown as Prisma.InputJsonValue }
        : {}),
    };

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.name !== undefined) {
        await tx.organization.update({ where: { id: organizationId }, data: { name: input.name } });
      }
      try {
        await tx.organizationProfile.upsert({
          where: { organizationId },
          create: { organizationId, ...profileWrite },
          update: profileWrite,
        });
      } catch (error) {
        // slug/subdomain are the only user-supplied unique columns on this
        // write — surface a clear 409 instead of letting P2002 propagate as a
        // raw 500 (no global exception filter exists in this app, see
        // core/errors/prisma-conflict.util.ts).
        //
        // EMPIRICALLY CONFIRMED (org.integration-spec.ts), not assumed:
        // `error.meta.target` comes back as the literal string
        // "(not available)" for this exact upsert-inside-withOrgContext shape
        // — a Prisma/driver limitation on this stack, not something this app
        // controls — so per-field narrowing via `meta.target` (the "ideal"
        // path `isUniqueConstraintViolationOn` supports) is NOT reliable
        // here. `slug` is the only one of the two actually reachable from the
        // UI today (no form field renders `subdomain` anywhere — confirmed by
        // grep), so one clear message correctly covers every real case;
        // revisit with a field-specific message if `subdomain` ever gets its
        // own UI.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException('Este nombre de portal ya está en uso. Elige otro.');
        }
        throw error;
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.profile_updated',
        entityType: 'organization',
        entityId: organizationId,
        // Only WHICH fields changed — never the values (avoid logging PII).
        metadata: { fields: Object.keys(input) },
      });

      // S-3: every verification runs its own audit trail entry, matched or
      // not — atomic with the write it protected (the NIT-blocked case above
      // records its own audit BEFORE this transaction even starts, since here
      // the write always succeeds).
      let duplicateWarning: OrganizationDuplicateWarning | undefined;
      if (nit || name) {
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'organization.duplicate_check_performed',
          entityType: 'organization',
          entityId: organizationId,
          metadata: {
            nitChecked: Boolean(nit),
            nameChecked: Boolean(name),
            similarNameMatches: similarMatches.length,
          },
        });
        if (similarMatches.length > 0) {
          await tx.organizationDuplicateFlag.createMany({
            data: similarMatches.map((match) => ({
              organizationId,
              matchedOrganizationId: match.organizationId,
              matchType: 'similar_name',
              similarityScore: match.similarityScore,
            })),
          });
          duplicateWarning = { matches: similarMatches };
        }
      }

      const [org, profile] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      ]);
      return { ...toOrganization(org, profile), ...(duplicateWarning ? { duplicateWarning } : {}) };
    });
  }

  /**
   * Public portal view by slug. Reads through the `organization_public`
   * SECURITY DEFINER function, which returns ONLY public columns (NIT only when
   * formalized; never phone/legalName) without needing a tenant context and
   * without evading RLS. Returns null when no organization has that slug.
   */
  async getPublicBySlug(slug: string): Promise<OrganizationPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: OrganizationPublic | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    return rows[0]?.data ?? null;
  }
}
