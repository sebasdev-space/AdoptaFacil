import type { PrismaClient } from '@prisma/client';

/**
 * Test fixture helper (T-Google-SignIn): fills in the 3 fields the
 * profile-completion gate requires (`phone`/`documentId`/`address`, see
 * `core/auth/require-complete-profile.ts`) directly on the `users` row, on a
 * SUPERUSER connection (bypasses RLS — same convention as `purgeOrganizations`
 * in `cleanup.ts`).
 *
 * Every integration test that registers a Person and then exercises one of
 * the 3 gated actions (donate/apadrinar, solicitar adopción, inscribirse a
 * voluntariado) calls this right after registration so the gate — added
 * alongside Google Sign-In — doesn't turn those pre-existing flows into a 422.
 * `admin` MUST be the superuser PrismaClient (same one `purgeOrganizations`
 * takes), never the RLS-scoped app client.
 */
export async function completeTestProfile(admin: PrismaClient, userId: string): Promise<void> {
  await admin.user.update({
    where: { id: userId },
    data: {
      phone: '3000000000',
      documentId: '1000000000',
      address: 'Calle 1 # 2-3, Bogotá',
    },
  });
}
