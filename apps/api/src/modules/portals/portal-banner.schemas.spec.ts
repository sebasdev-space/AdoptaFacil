import {
  bannerUploadTargetSchema,
  createBannerPhotoSchema,
  reorderBannerSchema,
  updateBannerPhotoSchema,
} from './portal-banner.schemas';

const UUID = '6f1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00';

describe('portal banner schemas', () => {
  it('requires a non-blank alt text on create', () => {
    expect(createBannerPhotoSchema.safeParse({ storageKey: 'k', altText: '   ' }).success).toBe(
      false,
    );
    expect(createBannerPhotoSchema.safeParse({ storageKey: 'k' }).success).toBe(false);
    const ok = createBannerPhotoSchema.safeParse({ storageKey: 'k', altText: ' Perro ' });
    expect(ok.success && ok.data.altText).toBe('Perro');
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      createBannerPhotoSchema.safeParse({ storageKey: 'k', altText: 'a', organizationId: 'x' })
        .success,
    ).toBe(false);
  });

  it('upload target only accepts jpeg/png/webp', () => {
    expect(
      bannerUploadTargetSchema.safeParse({ filename: 'a.png', contentType: 'image/png' }).success,
    ).toBe(true);
    expect(
      bannerUploadTargetSchema.safeParse({ filename: 'a.gif', contentType: 'image/gif' }).success,
    ).toBe(false);
    expect(
      bannerUploadTargetSchema.safeParse({ filename: 'a.pdf', contentType: 'application/pdf' })
        .success,
    ).toBe(false);
  });

  it('update needs at least one field and a non-blank alt', () => {
    expect(updateBannerPhotoSchema.safeParse({}).success).toBe(false);
    expect(updateBannerPhotoSchema.safeParse({ altText: '' }).success).toBe(false);
    expect(updateBannerPhotoSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('reorder takes 1..4 uuids', () => {
    expect(reorderBannerSchema.safeParse({ ids: [UUID] }).success).toBe(true);
    expect(reorderBannerSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(reorderBannerSchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(reorderBannerSchema.safeParse({ ids: Array(5).fill(UUID) }).success).toBe(false);
  });
});
