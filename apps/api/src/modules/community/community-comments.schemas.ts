import { z } from 'zod';

/** Comment body bounds (1–1000 characters) — narrower than a post's, since a
 *  comment is a short reply, not a standalone publication. */
export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
