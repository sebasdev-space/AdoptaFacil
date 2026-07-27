import { z } from 'zod';

/** Runtime validation schemas for the auth DTOs published in
 *  `@adoptafacil/contracts`. Kept here (not in contracts) so the contract stays
 *  a dependency-free type surface for the web app. */

const email = z.string().trim().toLowerCase().email().max(320);
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
const name = z.string().trim().min(1).max(200);

export const registerOrganizationSchema = z.object({
  organizationName: name,
  displayName: name,
  email,
  password,
});

export const registerPersonSchema = z.object({
  displayName: name,
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email,
});

// Same password-strength policy as registration (reuses `password` above), so a
// reset can never set a credential weaker than what registration would accept.
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(512),
  password,
});
