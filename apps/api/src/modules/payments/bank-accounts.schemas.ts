import { z } from 'zod';

/** Runtime validation for the org's registered payout bank account (M15b,
 *  RF26). `.strict()` rejects unknown keys — same convention as donations. */
export const registerBankAccountSchema = z
  .object({
    bankCode: z.string().trim().min(1).max(20),
    accountType: z.enum(['savings', 'checking']),
    accountNumber: z
      .string()
      .trim()
      .min(4, 'El número de cuenta es demasiado corto.')
      .max(34, 'El número de cuenta es demasiado largo.'),
    accountHolderName: z.string().trim().min(1).max(200),
    accountHolderDocument: z.string().trim().min(4).max(20),
  })
  .strict();
