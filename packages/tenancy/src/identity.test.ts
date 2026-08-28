import { describe, expect, it } from 'vitest';
import { DevIdentityAdapter } from './identity';

describe('DevIdentityAdapter', () => {
  const adapter = new DevIdentityAdapter('test-secret');

  it('round-trips signed claims', async () => {
    const token = adapter.signToken({ tenantSlug: 'acme', subject: 'idp|u1', email: 'a@b.c' });
    const claims = await adapter.verifyToken(token);
    expect(claims).toMatchObject({ tenantSlug: 'acme', subject: 'idp|u1', email: 'a@b.c' });
    expect(claims?.platformAdmin).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const token = adapter.signToken({ tenantSlug: 'acme', subject: 'idp|u1' });
    const [, sig] = token.split('.') as [string, string];
    const forged = `${Buffer.from(JSON.stringify({ tenantSlug: 'other', subject: 'idp|u1' })).toString('base64url')}.${sig}`;
    expect(await adapter.verifyToken(forged)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const other = new DevIdentityAdapter('another-secret');
    const token = other.signToken({ tenantSlug: 'acme', subject: 'idp|u1' });
    expect(await adapter.verifyToken(token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await adapter.verifyToken('garbage')).toBeNull();
    expect(await adapter.verifyToken('a.b.c')).toBeNull();
    expect(await adapter.verifyToken('')).toBeNull();
  });
});
