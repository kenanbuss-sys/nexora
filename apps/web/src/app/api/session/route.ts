import { DevIdentityAdapter } from '@nexora/tenancy';
import { NextResponse } from 'next/server';

/**
 * Dev-mode sign-in: mints an HMAC dev identity token server-side so the
 * signing secret never reaches the browser. In OIDC mode this route is
 * replaced by the identity provider's flow (the identity port stays the
 * same on the API side).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: 'Invalid JSON' },
      { status: 400 },
    );
  }
  const input = body as {
    tenantSlug?: unknown;
    subject?: unknown;
    email?: unknown;
    platformAdmin?: unknown;
  };
  const tenantSlug = typeof input.tenantSlug === 'string' ? input.tenantSlug.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const email =
    typeof input.email === 'string' && input.email.trim() ? input.email.trim() : undefined;
  const platformAdmin = input.platformAdmin === true;

  if (!tenantSlug || !subject) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: 'tenantSlug and subject are required' },
      { status: 400 },
    );
  }

  const adapter = new DevIdentityAdapter(process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me');
  const token = adapter.signToken({
    tenantSlug,
    subject,
    ...(email !== undefined ? { email } : {}),
    ...(platformAdmin ? { platformAdmin } : {}),
  });
  return NextResponse.json({ token, tenantSlug, subject, email: email ?? null, platformAdmin });
}
