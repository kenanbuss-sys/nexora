import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { IdentityClaims, IdentityPort } from './identity';

/**
 * Production OIDC adapter (IAM-007). Validates RS256 JWTs against the
 * IdP's JWKS: issuer, audience, expiry and signature are all enforced;
 * tenant membership comes from a configurable trusted claim. The
 * business domains depend on IdentityPort only — swapping the IdP is
 * configuration, not code.
 */

export interface OidcOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  /** Claim carrying the tenant slug (default 'tenant'). */
  tenantClaim?: string | undefined;
  /** Claim marking platform operators (default 'platform_admin'). */
  platformAdminClaim?: string | undefined;
  /** JWKS cache TTL in ms (default 300000). */
  jwksTtlMs?: number | undefined;
}

interface Jwk {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class OidcIdentityAdapter implements IdentityPort {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;

  constructor(private readonly options: OidcOptions) {}

  private async keyFor(kid: string): Promise<KeyObject | null> {
    const ttl = this.options.jwksTtlMs ?? 300_000;
    if (!this.keys.has(kid) || Date.now() - this.fetchedAt > ttl) {
      try {
        const response = await fetch(this.options.jwksUrl, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return this.keys.get(kid) ?? null;
        const body = (await response.json()) as { keys?: Jwk[] };
        const fresh = new Map<string, KeyObject>();
        for (const jwk of body.keys ?? []) {
          if (typeof jwk.kid !== 'string') continue;
          try {
            fresh.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
          } catch {
            // Skip unusable keys; the rest of the set still works.
          }
        }
        this.keys = fresh;
        this.fetchedAt = Date.now();
      } catch {
        // Network failure: keep the cached set (possibly empty).
      }
    }
    return this.keys.get(kid) ?? null;
  }

  async verifyToken(token: string): Promise<IdentityClaims | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = b64urlJson(headerPart);
    const payload = b64urlJson(payloadPart);
    if (!header || !payload) return null;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
    if (payload.iss !== this.options.issuer) return null;
    const audience = payload.aud;
    const audOk = Array.isArray(audience)
      ? audience.includes(this.options.audience)
      : audience === this.options.audience;
    if (!audOk) return null;

    const key = await this.keyFor(header.kid);
    if (!key) return null;
    const data = Buffer.from(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, 'base64url');
    let valid = false;
    try {
      valid = cryptoVerify('RSA-SHA256', data, key, signature);
    } catch {
      valid = false;
    }
    if (!valid) return null;

    const tenantClaim = this.options.tenantClaim ?? 'tenant';
    const platformClaim = this.options.platformAdminClaim ?? 'platform_admin';
    const tenantSlug = payload[tenantClaim];
    const subject = payload.sub;
    if (typeof subject !== 'string' || subject.length === 0) return null;
    if (typeof tenantSlug !== 'string' || tenantSlug.length === 0) return null;
    return {
      tenantSlug,
      subject,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      platformAdmin: payload[platformClaim] === true,
    };
  }
}
