import { z } from 'zod';
import { ProductCategory } from '@adoptafacil/contracts';

/** Runtime validation for M10 products. `.strict()` rejects unknown keys —
 *  same convention as campaigns/resources. */
const price = z
  .number()
  .int('El precio debe ser un número entero.')
  .positive('El precio debe ser mayor a 0.');

const stock = z
  .number()
  .int('El stock debe ser un número entero.')
  .nonnegative('El stock no puede ser negativo.');

export const productImageInputSchema = z
  .object({
    filename: z.string().trim().min(1),
    contentType: z.string().trim().min(1).optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(ProductCategory),
    price,
    stock: stock.optional(),
    images: z.array(productImageInputSchema).max(10).optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(ProductCategory).optional(),
    price: price.optional(),
    stock: stock.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

export const addProductImageSchema = productImageInputSchema;
