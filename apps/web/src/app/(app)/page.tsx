'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { useApp } from './app-shell';

interface Health {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  uptimeSeconds: number;
}

export default function DashboardPage() {
  const { session, grants, can } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ products?: number; parties?: number; tasks?: number }>({});

  useEffect(() => {
    api<Health>('GET', '/health')
      .then(setHealth)
      .catch((e: unknown) => setHealthError(errorText(e)));
    if (can('product.read')) {
      api<{ products: unknown[] }>('GET', '/api/v1/products/search')
        .then((r) => setCounts((c) => ({ ...c, products: r.products.length })))
        .catch(() => undefined);
    }
    if (can('mdm.read')) {
      api<{ parties: unknown[] }>('GET', '/api/v1/parties?q=')
        .then((r) => setCounts((c) => ({ ...c, parties: r.parties.length })))
        .catch(() => undefined);
    }
    api<{ tasks: unknown[] }>('GET', '/api/v1/inbox')
      .then((r) => setCounts((c) => ({ ...c, tasks: r.tasks.length })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page">
      <h1>Dashboard</h1>
      <p className="page-sub">
        Signed in as <span className="mono">{session.subject}</span> on tenant{' '}
        <strong>{session.tenantSlug}</strong> · {grants.length} granted permissions
      </p>

      <div className="grid-2">
        <div className="card">
          <h2>System health</h2>
          {healthError ? <div className="alert alert-error">{healthError}</div> : null}
          {!health && !healthError ? <div className="loading">Checking…</div> : null}
          {health ? (
            <div className="row">
              <span className={`badge ${health.status === 'ok' ? 'badge-ok' : 'badge-danger'}`}>
                API {health.status}
              </span>
              <span className={`badge ${health.db === 'up' ? 'badge-ok' : 'badge-danger'}`}>
                database {health.db}
              </span>
              <span className={`badge ${health.redis === 'up' ? 'badge-ok' : 'badge-danger'}`}>
                redis {health.redis}
              </span>
              <span className="badge">up {Math.floor(health.uptimeSeconds / 60)} min</span>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>At a glance</h2>
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="kpi">{counts.tasks ?? '–'}</div>
              <div className="kpi-label">Open tasks</div>
            </div>
            <div>
              <div className="kpi">{counts.products ?? '–'}</div>
              <div className="kpi-label">Products</div>
            </div>
            <div>
              <div className="kpi">{counts.parties ?? '–'}</div>
              <div className="kpi-label">Parties</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Quick actions</h2>
        <div className="row">
          {can('mdm.create') ? (
            <Link className="btn" href="/parties">
              New party
            </Link>
          ) : null}
          {can('product.manage') ? (
            <Link className="btn" href="/catalog">
              New product
            </Link>
          ) : null}
          {can('inventory.receive') ? (
            <Link className="btn" href="/inventory">
              Receive stock
            </Link>
          ) : null}
          {can('iam.user.manage') ? (
            <Link className="btn" href="/users">
              Invite user
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
