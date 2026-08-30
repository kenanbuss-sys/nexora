'use client';

import { useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface ProvisionResult {
  tenant: { id: string; slug: string; name: string };
  adminUserId?: string;
}

export default function PlatformPage() {
  const { session } = useApp();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminSubject, setAdminSubject] = useState('');
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session.platformAdmin) {
    return (
      <main className="page">
        <h1>Platform</h1>
        <div className="alert alert-error">
          This area is for platform operators only. Sign in with the platform operator option to
          provision tenants.
        </div>
      </main>
    );
  }

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const created = await api<ProvisionResult>('POST', '/api/v1/tenants', {
        slug,
        name,
        ...(adminEmail && adminName && adminSubject
          ? {
              initialAdmin: {
                email: adminEmail,
                displayName: adminName,
                idpSubject: adminSubject,
              },
            }
          : {}),
      });
      setResult(created);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Platform operations</h1>
      <p className="page-sub">Provision new tenants. Each tenant is isolated from every other.</p>

      <div className="grid-2">
        <form className="card" onSubmit={provision}>
          <h2>New tenant</h2>
          <label className="label">Slug (URL-safe identifier)</label>
          <input
            className="input mono"
            placeholder="e.g. acme"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <label className="label">Display name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <h2 style={{ marginTop: 18 }}>Initial administrator (optional)</h2>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <label className="label">Display name</label>
          <input
            className="input"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
          <label className="label">Identity subject (dev mode sign-in)</label>
          <input
            className="input mono"
            placeholder="idp|admin"
            value={adminSubject}
            onChange={(e) => setAdminSubject(e.target.value)}
          />

          {error ? <div className="alert alert-error">{error}</div> : null}
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            disabled={busy}
            type="submit"
          >
            {busy ? 'Provisioning…' : 'Provision tenant'}
          </button>
        </form>

        {result ? (
          <div className="card">
            <h2>Tenant created</h2>
            <div className="alert alert-ok">
              Tenant <strong>{result.tenant.name}</strong> ({result.tenant.slug}) is ready.
            </div>
            {result.adminUserId ? (
              <p>
                Initial administrator provisioned. Sign out and sign in with tenant{' '}
                <span className="mono">{result.tenant.slug}</span> and subject{' '}
                <span className="mono">{adminSubject}</span> to start working.
              </p>
            ) : (
              <p className="muted">No initial administrator was created.</p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
