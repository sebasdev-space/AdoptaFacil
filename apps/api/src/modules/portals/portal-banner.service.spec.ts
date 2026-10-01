import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PortalBannerService } from './portal-banner.service';

const ORG = '6f1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const KEY = `public/${ORG}/9c1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00-foto.jpg`;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    position: 0,
    storageRef: KEY,
    altText: 'Perro feliz',
    isActive: true,
    createdByUserId: ACTOR,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    ...over,
  };
}

function build(opts: { orgId?: string | null; existing?: unknown[]; object?: unknown } = {}) {
  const photo = {
    findMany: jest.fn().mockResolvedValue(opts.existing ?? []),
    findUnique: jest.fn().mockResolvedValue(row()),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(row(data))),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve(row(data))),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const tx = { portalBannerPhoto: photo, $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = {
    portalBannerPhoto: photo,
    withOrgContext: jest.fn((_org: string, fn: (t: unknown) => unknown) => fn(tx)),
  };
  const tenant = { getOrganizationId: () => (opts.orgId === undefined ? ORG : opts.orgId) };
  const audit = { recordWithTx: jest.fn().mockResolvedValue({}) };
  const storage = {
    resolvePublicUrl: (k: string) => `http://x/storage/public?key=${k}`,
    createUploadTarget: jest.fn().mockResolvedValue({ key: KEY, url: 'u' }),
    readObject: jest
      .fn()
      .mockResolvedValue(opts.object === undefined ? { data: Buffer.alloc(10) } : opts.object),
  };
  const service = new PortalBannerService(
    prisma as never,
    tenant as never,
    audit as never,
    storage as never,
  );
  return { service, photo, audit, storage, prisma };
}

describe('PortalBannerService', () => {
  it('public read projects only active rows with minimal columns', async () => {
    const { service, photo } = build({
      existing: [{ id: 'i1', storageRef: KEY, altText: 'Alt' }],
    });
    const result = await service.getPublic();
    expect(photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        select: { id: true, storageRef: true, altText: true },
      }),
    );
    expect(result.items).toEqual([
      { id: 'i1', imageUrl: `http://x/storage/public?key=${KEY}`, altText: 'Alt' },
    ]);
  });

  it('reserves a PUBLIC upload target under the actor org', async () => {
    const { service, storage } = build();
    await service.createUploadTarget({ filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(storage.createUploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, visibility: 'public' }),
    );
  });

  it('requires tenant context', async () => {
    const { service } = build({ orgId: null });
    await expect(service.create(ACTOR, { storageKey: KEY, altText: 'a' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('create takes the first free slot and audits', async () => {
    const { service, photo, audit } = build({ existing: [{ position: 0 }, { position: 2 }] });
    await service.create(ACTOR, { storageKey: KEY, altText: 'Perro feliz' });
    expect(photo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ position: 1, altText: 'Perro feliz', storageRef: KEY }),
    });
    expect(audit.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'portal_banner.photo_added', actorUserId: ACTOR }),
    );
  });

  it('rejects a 5th photo (max 4)', async () => {
    const { service, photo } = build({
      existing: [{ position: 0 }, { position: 1 }, { position: 2 }, { position: 3 }],
    });
    await expect(service.create(ACTOR, { storageKey: KEY, altText: 'a' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(photo.create).not.toHaveBeenCalled();
  });

  it('rejects keys of another org, private keys and non-image extensions', async () => {
    const { service } = build();
    const other = `public/22222222-2222-4222-8222-222222222222/9c1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00-a.jpg`;
    const priv = `private/${ORG}/9c1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00-a.jpg`;
    const gif = `public/${ORG}/9c1d2c3a-1b2c-4d3e-8f4a-5b6c7d8e9f00-a.gif`;
    for (const storageKey of [other, priv, gif, '../etc/passwd']) {
      await expect(service.create(ACTOR, { storageKey, altText: 'a' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('rejects a key whose bytes were never uploaded or exceed 5 MB', async () => {
    const missing = build({ object: null });
    await expect(
      missing.service.create(ACTOR, { storageKey: KEY, altText: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const big = build({ object: { data: Buffer.alloc(5 * 1024 * 1024 + 1) } });
    await expect(
      big.service.create(ACTOR, { storageKey: KEY, altText: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reorder requires the exact current id set and rewrites positions', async () => {
    const { service, photo, audit } = build({ existing: [{ id: 'a' }, { id: 'b' }] });
    await expect(service.reorder(ACTOR, { ids: ['a'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.reorder(ACTOR, { ids: ['a', 'a'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    photo.findMany.mockReset();
    photo.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValueOnce([row({ id: 'b', position: 0 }), row({ id: 'a', position: 1 })]);
    await service.reorder(ACTOR, { ids: ['b', 'a'] });
    expect(photo.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 0 } });
    expect(photo.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1 } });
    expect(audit.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'portal_banner.reordered' }),
    );
  });

  it('update toggles active and audits', async () => {
    const { service, photo, audit } = build();
    await service.update(ACTOR, 'x', { isActive: false });
    expect(photo.update).toHaveBeenCalledWith({ where: { id: 'x' }, data: { isActive: false } });
    expect(audit.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'portal_banner.photo_updated' }),
    );
  });

  it('remove deletes, compacts positions and audits', async () => {
    const { service, photo, audit } = build({ existing: [{ id: 'b', position: 1 }] });
    await service.remove(ACTOR, 'a0000000-0000-4000-8000-000000000001');
    expect(photo.delete).toHaveBeenCalled();
    expect(photo.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 0 } });
    expect(audit.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'portal_banner.photo_removed' }),
    );
  });
});
