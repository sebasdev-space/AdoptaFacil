import { PostType } from '@adoptafacil/contracts';
import { createPostSchema, updatePostSchema } from './community-posts.schemas';

describe('community post validation (M11)', () => {
  const valid = { type: PostType.General, body: 'Hola, esta es mi primera publicación aquí.' };

  it('accepts a minimal valid post', () => {
    expect(createPostSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a body shorter than 10 characters', () => {
    expect(createPostSchema.safeParse({ ...valid, body: 'corto' }).success).toBe(false);
  });

  it('rejects a body longer than 2000 characters', () => {
    expect(createPostSchema.safeParse({ ...valid, body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('accepts a body of exactly 10 and exactly 2000 characters', () => {
    expect(createPostSchema.safeParse({ ...valid, body: 'x'.repeat(10) }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...valid, body: 'x'.repeat(2000) }).success).toBe(true);
  });

  it('rejects an unknown post type', () => {
    expect(createPostSchema.safeParse({ ...valid, type: 'rumor' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createPostSchema.safeParse({ ...valid, organizationId: 'x' }).success).toBe(false);
  });

  it('accepts an optional set of JPEG/PNG images', () => {
    const parsed = createPostSchema.safeParse({
      ...valid,
      images: [{ filename: 'a.jpg', contentType: 'image/jpeg' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an image with a non-JPEG/PNG content type', () => {
    expect(
      createPostSchema.safeParse({
        ...valid,
        images: [{ filename: 'a.gif', contentType: 'image/gif' }],
      }).success,
    ).toBe(false);
  });

  it('rejects more than 6 images', () => {
    const images = Array.from({ length: 7 }, (_, i) => ({
      filename: `img-${i}.jpg`,
      contentType: 'image/jpeg' as const,
    }));
    expect(createPostSchema.safeParse({ ...valid, images }).success).toBe(false);
  });

  it('update requires at least one field', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(false);
    expect(updatePostSchema.safeParse({ title: 'Nuevo título' }).success).toBe(true);
  });

  it('update enforces the same body length bounds as create', () => {
    expect(updatePostSchema.safeParse({ body: 'corto' }).success).toBe(false);
    expect(updatePostSchema.safeParse({ body: 'x'.repeat(11) }).success).toBe(true);
  });
});
