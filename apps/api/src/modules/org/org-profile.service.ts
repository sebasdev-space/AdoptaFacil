import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Organization as OrgRow, OrganizationProfile as ProfileRow } from '@prisma/client';
import {
  FormalizationState,
  type Organization,
  type OrganizationLocation,
  type OrganizationPublic,
  type OrganizationSocialLinks,
  type UpdateOrganizationProfileInput,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

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
    subdomain: profile?.subdomain ?? undefined,
    slug: profile?.slug ?? undefined,
    formalizationState:
      (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
    rteVigente: profile?.rteVigente ?? false,
    verificationLevel: (profile?.verificationLevel as VerificationLevel | null) ?? undefined,
  };
}

@Injectable()
export class OrgProfileService {
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
      ...(input.location !== undefined
        ? { location: input.location as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.socialLinks !== undefined
        ? { socialLinks: input.socialLinks as unknown as Prisma.InputJsonValue }
        : {}),
    };

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.name !== undefined) {
        await tx.organization.update({ where: { id: organizationId }, data: { name: input.name } });
      }
      await tx.organizationProfile.upsert({
        where: { organizationId },
        create: { organizationId, ...profileWrite },
        update: profileWrite,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.profile_updated',
        entityType: 'organization',
        entityId: organizationId,
        // Only WHICH fields changed — never the values (avoid logging PII).
        metadata: { fields: Object.keys(input) },
      });
      const [org, profile] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      ]);
      return toOrganization(org, profile);
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
