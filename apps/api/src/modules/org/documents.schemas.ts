import { z } from 'zod';
import { DocumentType } from '@adoptafacil/contracts';

/** Upload a new document version (Owner/Administrator). `.strict()` rejects
 *  unknown keys; the server assigns `version` and sets status Pending. */
export const uploadDocumentSchema = z
  .object({
    type: z.nativeEnum(DocumentType),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    issuedAt: z.string().datetime({ offset: true }).optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

/** Platform review decision. A reason (`note`, motivo) is MANDATORY for observe
 *  and reject — enforced here (400) and again in the DB function as a backstop. */
export const reviewDocumentSchema = z
  .object({
    decision: z.enum(['observe', 'approve', 'reject']),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.decision === 'approve' || (value.note !== undefined && value.note.trim().length > 0),
    {
      message: 'A reason (note) is required to observe or reject a document.',
      path: ['note'],
    },
  );
