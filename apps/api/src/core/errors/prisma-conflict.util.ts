import { Prisma } from '@prisma/client';

/**
 * True when `error` is a Prisma unique-constraint violation (`P2002`). Used to
 * translate a raw DB conflict into a typed `ConflictException` with a clear
 * message INSTEAD of letting it propagate as an unhandled 500 — there is no
 * global exception filter in this app (checked: no `APP_FILTER`/`@Catch`
 * anywhere), so each write that can hit a real unique constraint must guard
 * for it explicitly, same convention already used for pre-checked conflicts
 * (`ConflictException` in `auth.service.ts`/`animals.service.ts`).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Same check, narrowed to a specific column — Prisma's `P2002` sets
 * `error.meta.target` to the column name(s) involved (an array for Postgres in
 * every case observed in this codebase). Use this when a single write could
 * violate more than one unique constraint (e.g. `slug` and `subdomain` on the
 * same `organizationProfile.upsert`) and each needs its own message.
 */
export function isUniqueConstraintViolationOn(error: unknown, column: string): boolean {
  if (!isUniqueConstraintViolation(error)) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  if (typeof target === 'string') return target === column || target.includes(column);
  if (Array.isArray(target)) return target.includes(column);
  return false;
}
