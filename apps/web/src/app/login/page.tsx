'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setSession } from '../../lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, subject, email: email || undefined, platformAdmin }),
      });
      const data = (await response.json()) as {
        token?: string;
        message?: string;
        email?: string | null;
      };
      if (!response.ok || !data.token) {
        setError(data.message ?? 'Sign-in failed');
        return;
      }
      setSession({
        token: data.token,
        tenantSlug,
        subject,
        ...(email ? { email } : {}),
        platformAdmin,
      });
      router.push(platformAdmin ? '/platform' : '/');
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
        <form
          className="card"
          style={{ width: 380, boxShadow: 'var(--shadow-lg)' }}
          onSubmit={submit}
        >
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Development identity mode — enter your tenant and identity subject.
          </p>

          <label className="label" htmlFor="tenant">
            Tenant
          </label>
          <input
            id="tenant"
            className="input"
            placeholder="e.g. acme"
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

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={busy}
            type="submit"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
