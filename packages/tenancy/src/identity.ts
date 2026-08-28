import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Provider-neutral identity boundary (locked decision: OIDC-first,
 * production IdP can vary without changing business domains).
 *
 * `IdentityPort` is what the application depends on. `DevIdentityAdapter` is
 * the development/test implementation: a compact HMAC-signed token that mimics
 * verified OIDC claims. A production OIDC adapter implements the same port in
 * a later sprint; nothing outside the adapter changes.
 */
export interface IdentityClaims {
  /** Tenant the session belongs to (from the trusted claim, not client input). */
  tenantSlug: string;
  /** Subject identifier at the identity provider. */
  subject: string;
  email?: string | undefined;
  /** Verified platform-operator sessions (tenant provisioning etc.). */
  platformAdmin?: boolean | undefined;
}

export interface IdentityPort {
  /** Verify a bearer token and return its claims, or null when invalid. */
  verifyToken(token: string): Promise<IdentityClaims | null>;
}

interface DevTokenPayload {
  tenantSlug?: string;
  subject?: string;
  email?: string;
  platformAdmin?: boolean;
}

/** Dev/test identity adapter: `base64url(json).base64url(hmacSha256(json))`. */
export class DevIdentityAdapter implements IdentityPort {
  constructor(private readonly secret: string) {}

  signToken(claims: IdentityClaims): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  verifyToken(token: string): Promise<IdentityClaims | null> {
    const parts = token.split('.');
    if (parts.length !== 2) return Promise.resolve(null);
    const [body, signature] = parts as [string, string];
    const expected = this.mac(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return Promise.resolve(null);

    let payload: DevTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DevTokenPayload;
    } catch {
      return Promise.resolve(null);
    }
    if (typeof payload.subject !== 'string' || payload.subject.length === 0) {
      return Promise.resolve(null);
    }
    if (typeof payload.tenantSlug !== 'string' || payload.tenantSlug.length === 0) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      tenantSlug: payload.tenantSlug,
      subject: payload.subject,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      platformAdmin: payload.platformAdmin === true,
    });
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
