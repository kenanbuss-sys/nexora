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

interface ExecutiveSummary {
  revenue: string;
  openReceivables: string;
  openPayables: string;
  openOrders: number;
  quotePipeline: string;
  wipOrders: number;
  scrapRatePct: string;
  openNcrs: number;
}

interface AgingSummary {
  totalOpen: string;
  buckets: Array<{ bucket: string; amount: string }>;
}

interface TaskRow {
  id: string;
  title: string;
  dueAt: string | null;
}

interface NotificationRow {
  id: string;
  title: string;
  createdAt: string;
}

/** The KPI home: what needs attention today, at a glance. */
export default function DashboardPage() {
  const { session, can } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    api<Health>('GET', '/health')
      .then(setHealth)
      .catch((e: unknown) => setHealthError(errorText(e)));
    if (can('analytics.read')) {
      api<ExecutiveSummary>('GET', '/api/v1/analytics/executive')
        .then(setSummary)
        .catch(() => setSummary(null));
    }
    if (can('finance.read')) {
      api<AgingSummary>('GET', '/api/v1/finance/aging?type=CUSTOMER')
        .then(setAging)
        .catch(() => setAging(null));
    }
    api<{ tasks: TaskRow[] }>('GET', '/api/v1/inbox')
      .then((r) => setTasks(r.tasks.slice(0, 5)))
      .catch(() => setTasks([]));
    api<{ notifications: NotificationRow[] }>('GET', '/api/v1/notifications')
      .then((r) => setNotifications(r.notifications.slice(0, 5)))
      .catch(() => setNotifications([]));
    // eslint-disable-next-line
  }, []);

  const overdue = aging
    ? aging.buckets
        .filter((b) => b.bucket !== 'NOT_DUE')
        .reduce((s, b) => s + Number(b.amount), 0)
        .toFixed(2)
    : null;

  return (
    <main className="page">
      <div className="spread">
        <h1>Dashboard</h1>
        {health ? (
          <span className="row" style={{ gap: 6 }}>
            <span className={`badge ${health.status === 'ok' ? 'badge-ok' : 'badge-danger'}`}>
              API {health.status}
            </span>
            <span className={`badge ${health.db === 'up' ? 'badge-ok' : 'badge-danger'}`}>
              DB {health.db}
            </span>
            <span className={`badge ${health.redis === 'up' ? 'badge-ok' : 'badge-danger'}`}>
              Redis {health.redis}
            </span>
          </span>
        ) : null}
      </div>
      <p className="page-sub">
        Signed in as <span className="mono">{session.subject}</span> on tenant{' '}
        <strong>{session.tenantSlug}</strong>
      </p>
      {healthError ? <div className="alert alert-error">{healthError}</div> : null}

      {summary ? (
        <>
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Revenue (invoiced)</div>
              <div className="stat-value">{summary.revenue}</div>
            </Link>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Open receivables</div>
              <div className="stat-value">{summary.openReceivables}</div>
              {overdue !== null && Number(overdue) > 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-danger, #b91c1c)' }}>
                  {overdue} overdue
                </div>
              ) : null}
            </Link>
            <Link href="/orders" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Open orders</div>
              <div className="stat-value">{summary.openOrders}</div>
            </Link>
            <Link href="/quotes" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Quote pipeline</div>
              <div className="stat-value">{summary.quotePipeline}</div>
            </Link>
          </div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Link href="/production" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Work in progress</div>
              <div className="stat-value">{summary.wipOrders}</div>
            </Link>
            <Link href="/quality" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Open NCRs</div>
              <div
                className="stat-value"
                style={summary.openNcrs > 0 ? { color: 'var(--color-danger, #b91c1c)' } : {}}
              >
                {summary.openNcrs}
              </div>
            </Link>
            <Link href="/quality" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Scrap rate</div>
              <div className="stat-value">{summary.scrapRatePct}%</div>
            </Link>
            <Link href="/finance" className="card stat" style={{ textDecoration: 'none' }}>
              <div className="stat-label">Open payables</div>
              <div className="stat-value">{summary.openPayables}</div>
            </Link>
          </div>
        </>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <h2>My tasks</h2>
          {tasks.length === 0 ? <div className="empty">Nothing waiting on you.</div> : null}
          {tasks.map((t) => (
            <div key={t.id} className="spread" style={{ padding: '5px 0', fontSize: 14 }}>
              <span>{t.title}</span>
              {t.dueAt ? (
                <span className="muted mono" style={{ fontSize: 12 }}>
                  {new Date(t.dueAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          ))}
          <Link href="/tasks" className="muted" style={{ fontSize: 13 }}>
            All tasks →
          </Link>
        </div>
        <div className="card">
          <h2>Notifications</h2>
          {notifications.length === 0 ? <div className="empty">All caught up.</div> : null}
          {notifications.map((n) => (
            <div key={n.id} className="spread" style={{ padding: '5px 0', fontSize: 14 }}>
              <span>{n.title}</span>
              <span className="muted mono" style={{ fontSize: 12 }}>
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
