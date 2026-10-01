import { z } from 'zod';
import {
  HISTORY_ARRAY_CAP,
  HISTORY_DEFAULT_DAYS,
  HISTORY_DEFAULT_PAGE_SIZE,
  HISTORY_MAX_PAGE_SIZE,
} from '@adoptafacil/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Query validation for history listings (M04/M05). All params optional and
 * additive; `.strict()` rejects unknown keys. Dates are ISO-8601 (UTC).
 */
export function historyQuerySchema<const S extends readonly [string, ...string[]]>(statuses: S) {
  return z
    .object({
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
      status: z.enum(statuses).optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(HISTORY_MAX_PAGE_SIZE).optional(),
    })
    .strict()
    .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
      message: '`from` no puede ser posterior a `to`.',
      path: ['from'],
    });
}

export interface HistoryWindow {
  /** Inclusive lower bound on createdAt, if any. */
  gte?: Date;
  /** Inclusive upper bound on createdAt, if any. */
  lte?: Date;
  paged: boolean;
  page: number;
  take: number;
  skip: number;
}

/**
 * Resolves the effective window. No range AND no `page` => the default last
 * {@link HISTORY_DEFAULT_DAYS} days (array mode, capped). `page` present =>
 * paged mode with NO implicit date limit ("Ver todo").
 */
export function resolveHistoryWindow(
  q: { from?: string; to?: string; page?: number; pageSize?: number },
  now: Date = new Date(),
): HistoryWindow {
  const paged = q.page !== undefined;
  const hasRange = q.from !== undefined || q.to !== undefined;
  let gte = q.from ? new Date(q.from) : undefined;
  const lte = q.to ? new Date(q.to) : undefined;
  if (!paged && !hasRange) gte = new Date(now.getTime() - HISTORY_DEFAULT_DAYS * DAY_MS);
  if (!paged) return { gte, lte, paged, page: 1, take: HISTORY_ARRAY_CAP, skip: 0 };
  const page = q.page as number;
  const take = q.pageSize ?? HISTORY_DEFAULT_PAGE_SIZE;
  return { gte, lte, paged, page, take, skip: (page - 1) * take };
}

/** Prisma `createdAt` filter for a window (undefined when unbounded). */
export function createdAtFilter(w: HistoryWindow): { gte?: Date; lte?: Date } | undefined {
  if (!w.gte && !w.lte) return undefined;
  return { ...(w.gte && { gte: w.gte }), ...(w.lte && { lte: w.lte }) };
}
