import { ProductCategory } from '@adoptafacil/contracts';
import { createProductSchema, updateProductSchema } from './marketplace-products.schemas';

describe('marketplace product validation (M10)', () => {
  const valid = { name: 'Concentrado Premium 10kg', category: ProductCategory.Food, price: 85000 };

  it('accepts a minimal valid product (stock defaults handled by the service, not here)', () => {
    expect(createProductSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a name', () => {
    expect(createProductSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(createProductSchema.safeParse({ ...valid, category: 'electronics' }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(createProductSchema.safeParse({ ...valid, isActive: false }).success).toBe(false);
  });

  it('rejects a zero or negative price', () => {
    expect(createProductSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, price: -1000 }).success).toBe(false);
  });

  it('rejects a non-integer price', () => {
    expect(createProductSchema.safeParse({ ...valid, price: 1000.5 }).success).toBe(false);
  });

  it('rejects a negative stock, but accepts zero', () => {
    expect(createProductSchema.safeParse({ ...valid, stock: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, stock: 0 }).success).toBe(true);
  });

  it('accepts an optional set of images', () => {
    const parsed = createProductSchema.safeParse({
      ...valid,
      images: [{ filename: 'a.jpg' }, { filename: 'b.jpg', order: 1 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects more than 10 images', () => {
    const images = Array.from({ length: 11 }, (_, i) => ({ filename: `img-${i}.jpg` }));
    expect(createProductSchema.safeParse({ ...valid, images }).success).toBe(false);
  });

  it('rejects an image with no filename', () => {
    expect(createProductSchema.safeParse({ ...valid, images: [{ filename: '' }] }).success).toBe(
      false,
    );
  });

  it('update requires at least one field', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('update rejects a zero or negative price, and a negative stock', () => {
    expect(updateProductSchema.safeParse({ price: 0 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ stock: -1 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ price: 1 }).success).toBe(true);
    expect(updateProductSchema.safeParse({ stock: 0 }).success).toBe(true);
  });
});
