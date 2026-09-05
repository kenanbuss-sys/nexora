'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setSession } from '../../lib/session';

interface QuickIdentity {
  label: string;
  description: string;
  tenantSlug: string;
  subject: string;
  platformAdmin: boolean;
}

/** One-click identities for the development sign-in mode. */
const QUICK_IDENTITIES: QuickIdentity[] = [
  {
    label: 'Administrator (demo)',
    description: 'Full back office of the demo company',
    tenantSlug: 'demo',
    subject: 'idp|admin',
    platformAdmin: false,
  },
  {
    label: 'Platform operator',
    description: 'Provision tenants, usage overview',
    tenantSlug: 'platform',
    subject: 'ops|operator',
    platformAdmin: true,
  },
];

const REMEMBER_KEY = 'nexora.lastLogin';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [pwTenant, setPwTenant] = useState('demo');
  const [pwEmail, setPwEmail] = useState('');
  const [pwPassword, setPwPassword] = useState('');

  async function signInWithPassword() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/backend/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug: pwTenant, email: pwEmail, password: pwPassword }),
      });
      const data = (await response.json()) as {
        token?: string;
        subject?: string;
        email?: string;
        mustChangePassword?: boolean;
        message?: string;
      };
      if (!response.ok || !data.token || !data.subject) {
        setError(data.message ?? 'Sign-in failed');
        return;
      }
      try {
        window.localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ tenantSlug: pwTenant, subject: data.subject, email: data.email }),
        );
      } catch {
        // Remembering is a convenience, never a requirement.
      }
      setSession({
        token: data.token,
        tenantSlug: pwTenant,
        subject: data.subject,
        ...(data.email ? { email: data.email } : {}),
        platformAdmin: false,
      });
      router.push('/');
    } catch {
      setError('Could not reach the sign-in service');
    } finally {
      setBusy(false);
    }
  }

  // Prefill the last successful sign-in so nothing needs remembering.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const last = JSON.parse(raw) as {
        tenantSlug?: string;
        subject?: string;
        email?: string;
        platformAdmin?: boolean;
      };
      if (last.tenantSlug) setTenantSlug(last.tenantSlug);
      if (last.subject) setSubject(last.subject);
      if (last.email) setEmail(last.email);
      setPlatformAdmin(Boolean(last.platformAdmin));
      setRemembered(Boolean(last.tenantSlug && last.subject));
    } catch {
      // A blocked or empty store just means an empty form.
    }
  }, []);

  async function signIn(input: {
    tenantSlug: string;
    subject: string;
    email?: string;
    platformAdmin: boolean;
  }) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: input.tenantSlug,
          subject: input.subject,
          email: input.email || undefined,
          platformAdmin: input.platformAdmin,
        }),
      });
      const data = (await response.json()) as { token?: string; message?: string };
      if (!response.ok || !data.token) {
        setError(data.message ?? 'Sign-in failed');
        return;
      }
      try {
        window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(input));
      } catch {
        // Remembering is a convenience, never a requirement.
      }
      setSession({
        token: data.token,
        tenantSlug: input.tenantSlug,
        subject: input.subject,
        ...(input.email ? { email: input.email } : {}),
        platformAdmin: input.platformAdmin,
      });
      router.push(input.platformAdmin ? '/platform' : '/');
    } catch {
      setError('Could not reach the sign-in service');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-hero">
        <div style={{ fontWeight: 750, fontSize: 16, color: '#fff' }}>NexoraOS</div>
        <div>
          <h2>
            One platform for
            <br />
            your whole operation.
          </h2>
          <div className="points">
            <div>→ Multi-tenant and white-label from day one</div>
            <div>→ Inventory as an immutable ledger — stock that cannot lie</div>
            <div>→ Server-side permissions, full audit trail</div>
            <div>→ Scanners and devices with offline-safe capture</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#5b667a' }}>
          Modular enterprise platform — CRM · Orders · Warehouse · Manufacturing · Finance
        </div>
      </section>
      <section className="login-panel">
        <div style={{ width: 380 }}>
          <div className="card" style={{ boxShadow: 'var(--shadow-lg)', marginBottom: 12 }}>
            <h1 style={{ marginBottom: 4 }}>Quick sign in</h1>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              One click — no credentials to remember.
            </p>
            {QUICK_IDENTITIES.map((q) => (
              <button
                key={q.label}
                className="btn"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  padding: '10px 12px',
                }}
                disabled={busy}
                onClick={() =>
                  void signIn({
                    tenantSlug: q.tenantSlug,
                    subject: q.subject,
                    platformAdmin: q.platformAdmin,
                  })
                }
                type="button"
              >
                <div style={{ fontWeight: 650 }}>{q.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {q.description} · <span className="mono">{q.tenantSlug}</span>
                </div>
              </button>
            ))}
            {remembered ? (
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={busy}
                onClick={() =>
                  void signIn({
                    tenantSlug,
                    subject,
                    ...(email ? { email } : {}),
                    platformAdmin,
                  })
                }
                type="button"
              >
                {busy ? 'Signing in…' : `Continue as ${subject} @ ${tenantSlug}`}
              </button>
            ) : null}
            {error ? (
              <div className="alert alert-error" style={{ marginTop: 8 }}>
                {error}
              </div>
            ) : null}
          </div>

          <details className="card" style={{ boxShadow: 'var(--shadow-lg)', marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Sign in with password</summary>
            <form
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                void signInWithPassword();
              }}
            >
              <label className="label" htmlFor="pw-tenant">
                Tenant
              </label>
              <input
                id="pw-tenant"
                className="input"
                value={pwTenant}
                onChange={(e) => setPwTenant(e.target.value)}
                required
              />
              <label className="label" htmlFor="pw-email">
                Email
              </label>
              <input
                id="pw-email"
                className="input"
                type="email"
                value={pwEmail}
                onChange={(e) => setPwEmail(e.target.value)}
                required
              />
              <label className="label" htmlFor="pw-password">
                Password
              </label>
              <input
                id="pw-password"
                className="input"
                type="password"
                value={pwPassword}
                onChange={(e) => setPwPassword(e.target.value)}
                required
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 12 }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </details>

          <details className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>
              Advanced sign in (other identity)
            </summary>
            <form
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                void signIn({
                  tenantSlug,
                  subject,
                  ...(email ? { email } : {}),
                  platformAdmin,
                });
              }}
            >
              <label className="label" htmlFor="tenant">
                Tenant
              </label>
              <input
                id="tenant"
                className="input"
                placeholder="e.g. demo"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                required
              />
              <label className="label" htmlFor="subject">
                Identity subject
              </label>
              <input
                id="subject"
                className="input mono"
                placeholder="e.g. idp|admin"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
              <label className="label" htmlFor="email">
                Email (optional)
              </label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="row" style={{ margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={platformAdmin}
                  onChange={(e) => setPlatformAdmin(e.target.checked)}
                />
                <span>Platform operator (tenant provisioning)</span>
              </label>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </details>
        </div>
      </section>
    </main>
  );
}
