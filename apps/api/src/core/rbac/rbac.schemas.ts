import { z } from 'zod';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';

/** Validates a role assignment. Only ORGANIZATION roles may be assigned through
 *  the org-scoped endpoint — platform roles (Admin/SuperAdmin) are provisioned
 *  out of band and can never be granted by an organization admin. */
export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(Role).refine((role) => ORG_ROLES.includes(role), {
    message: 'Only organization roles can be assigned here',
  }),
});
