import { createSign, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OidcIdentityAdapter } from './oidc';

/**
 * Sprint 120 (IAM-007): the OIDC adapter enforces issuer, audience,
 * expiry, kid resolution via JWKS and the RS256 signature — the same
 * IdentityPort the dev adapter implements, so nothing else changes.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });

const ISSUER = 'https://idp.example';
const AUDIENCE = 'nexora-api';

function signJwt(
  payload: Record<string, unknown>,
  options?: { kid?: string; key?: typeof privateKey },
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: options?.kid ?? 'key-1' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  const signature = signer.sign(options?.key ?? privateKey).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function baseClaims(): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'idp|user-1',
    tenant: 'acme',
    email: 'user@acme.example',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

describe('OidcIdentityAdapter (IAM-007)', () => {
  let server: Server;
  let adapter: OidcIdentityAdapter;

  beforeAll(async () => {
    const jwk = publicKey.export({ format: 'jwk' });
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1', use: 'sig' }] }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    adapter = new OidcIdentityAdapter({
      issuer: ISSUER,
      audience: AUDIENCE,
      jwksUrl: `http://127.0.0.1:${port}/jwks`,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('accepts a valid RS256 token and maps the claims', async () => {
    const claims = await adapter.verifyToken(signJwt(baseClaims()));
    expect(claims).not.toBeNull();
    expect(claims?.tenantSlug).toBe('acme');
    expect(claims?.subject).toBe('idp|user-1');
    expect(claims?.email).toBe('user@acme.example');
    expect(claims?.platformAdmin).toBe(false);
  });

  it('maps the platform-admin claim', async () => {
    const claims = await adapter.verifyToken(signJwt({ ...baseClaims(), platform_admin: true }));
    expect(claims?.platformAdmin).toBe(true);
  });

  it('rejects expired tokens', async () => {
    const expired = signJwt({ ...baseClaims(), exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await adapter.verifyToken(expired)).toBeNull();
  });

  it('rejects a wrong issuer or audience', async () => {
    expect(await adapter.verifyToken(signJwt({ ...baseClaims(), iss: 'https://evil' }))).toBeNull();
    expect(await adapter.verifyToken(signJwt({ ...baseClaims(), aud: 'other-api' }))).toBeNull();
  });

  it('rejects unknown kids and foreign signatures', async () => {
    expect(await adapter.verifyToken(signJwt(baseClaims(), { kid: 'key-9' }))).toBeNull();
    expect(
      await adapter.verifyToken(signJwt(baseClaims(), { key: otherPair.privateKey })),
    ).toBeNull();
  });

  it('rejects tokens without tenant or subject claims', async () => {
    const noTenant = { ...baseClaims() };
    delete noTenant.tenant;
    expect(await adapter.verifyToken(signJwt(noTenant))).toBeNull();
    expect(await adapter.verifyToken(signJwt({ ...baseClaims(), sub: '' }))).toBeNull();
    expect(await adapter.verifyToken('not.a.jwt')).toBeNull();
  });
});
