import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a hash that differs from the plaintext and verifies it', async () => {
    const hash = await service.hash('s3cret-password!');
    expect(hash).not.toContain('s3cret-password!');
    expect(await service.verify('s3cret-password!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('right-password');
    expect(await service.verify('wrong-password', hash)).toBe(false);
  });

  it('produces different hashes for the same password (per-hash salt)', async () => {
    const a = await service.hash('same-password');
    const b = await service.hash('same-password');
    expect(a).not.toBe(b);
  });
});
