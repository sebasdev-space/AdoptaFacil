import { UnprocessableEntityException } from '@nestjs/common';
import {
  PROFILE_REQUIRED_FIELDS,
  type IncompleteProfileError,
  type ProfileRequiredField,
} from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from './auth.types';

/**
 * Thrown by {@link requireCompleteProfile} — a 422 whose body matches
 * `IncompleteProfileError` exactly (`{ error: 'INCOMPLETE_PROFILE', missing: [...] }`),
 * never a generic 500 or an opaque message. The web's "Completa tu perfil"
 * screen matches on `error === 'INCOMPLETE_PROFILE'` (see
 * `apps/web/src/shell/api/api-error.ts`).
 */
export class IncompleteProfileException extends UnprocessableEntityException {
  constructor(missing: ProfileRequiredField[]) {
    const body: IncompleteProfileError = { error: 'INCOMPLETE_PROFILE', missing };
    super(body);
  }
}

/**
 * The profile-completion gate (T-Google-SignIn, business rule #3): before a
 * **Person** account can (a) create a donation/sponsorship, (b) create an
 * adoption request, or (c) enroll in a volunteer opportunity, their `phone`,
 * `documentId` and `address` must ALL be set. Reused verbatim by
 * `DonationsService.create`, `SponsorshipsService.subscribe`,
 * `AdoptionsService.create` and `VolunteerEnrollmentsService.enroll` so the
 * rule (and its exact 422 shape) lives in exactly one place.
 *
 * Scoped to `accountType === 'person'` ON PURPOSE: the business rule names
 * "una cuenta Persona" specifically, and an Organization account never has
 * (or needs) these fields — a few existing endpoints let an org's OWN token
 * hit these routes for OTHER validations (e.g. the adoption conflict-of-
 * interest 403 for applying to your own org's animal), and those must still
 * surface THEIR OWN status code, not a 422 that would never make sense for
 * an org. Deliberately a no-op for any other account type.
 *
 * Reads the actor's OWN tenant-scoped `users` row under THEIR organization
 * context (never the target org's).
 *
 * NO OTHER action is gated by this — browsing, registering an organization,
 * logging in, etc. must never call this helper.
 */
export async function requireCompleteProfile(
  prisma: PrismaService,
  actor: Pick<RequestUser, 'id' | 'organizationId' | 'accountType'>,
): Promise<void> {
  if (actor.accountType !== 'person') {
    return;
  }

  const profile = await prisma.withOrgContext(actor.organizationId, (tx) =>
    tx.user.findUnique({
      where: { id: actor.id },
      select: { phone: true, documentId: true, address: true },
    }),
  );

  const missing = PROFILE_REQUIRED_FIELDS.filter((field) => !profile?.[field]);
  if (missing.length > 0) {
    throw new IncompleteProfileException(missing);
  }
}
