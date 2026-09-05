'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface SubscriptionView {
  id: string;
  name: string;
  url: string;
  eventTypes: string[];
  active: boolean;
}

interface SubscriptionHealth {
  subscriptionId: string;
  name: string;
  active: boolean;
  pending: number;
  delivered: number;
  failed: number;
  dead: number;
  lastDeliveredAt: string | null;
}

interface DeliveryView {
  id: string;
  subscriptionId: string;
  eventType: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'DEAD';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<DeliveryView['status'], string> = {
  PENDING: 'badge-warn',
  DELIVERED: 'badge-ok',
  FAILED: 'badge-warn',
  DEAD: 'badge-danger',
};

const SUGGESTED_EVENTS = [
  'order.confirmed',
  'order.fulfillment.planned',
  'invoice.issued',
  'payment.received',
  'work_order.completed',
  'qc.failed',
  'backorder.created',
];

export default function IntegrationsPage() {
  const { can } = useApp();
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[] | null>(null);
  const [health, setHealth] = useState<SubscriptionHealth[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['order.confirmed']);

  const load = useCallback(() => {
    api<{ subscriptions: SubscriptionView[] }>('GET', '/api/v1/integrations/webhooks')
      .then((r) => {
        setSubscriptions(r.subscriptions);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ subscriptions: SubscriptionHealth[] }>('GET', '/api/v1/integrations/health')
      .then((r) => setHealth(r.subscriptions))
      .catch(() => setHealth([]));
    api<{ deliveries: DeliveryView[] }>('GET', '/api/v1/integrations/deliveries')
      .then((r) => setDeliveries(r.deliveries))
      .catch(() => setDeliveries([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const healthFor = (id: string) => health.find((h) => h.subscriptionId === id);

  return (
    <main className="page">
      <h1>Integrations</h1>
      <p className="page-sub">
        Outbound webhooks — signed deliveries with retries, dead-lettering and full run history.
        Point external systems at your events without polling.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {secretOnce ? (
        <div className="alert alert-ok">
          Signing secret (shown once — store it now): <span className="mono">{secretOnce}</span>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <div className="spread">
            <h2>Subscriptions</h2>
            {can('integration.manage') ? (
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api('POST', '/api/v1/integrations/process'),
                    'Fan-out and delivery attempted for due webhooks.',
                  )
                }
                type="button"
              >
                Process now
              </button>
            ) : null}
          </div>
          {subscriptions === null ? <div className="loading">Loading…</div> : null}
          {subscriptions && subscriptions.length === 0 ? (
            <div className="empty">No webhook subscriptions yet.</div>
          ) : null}
          {(subscriptions ?? []).map((s) => {
            const h = healthFor(s.id);
            return (
              <div
                key={s.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <strong>{s.name}</strong>
                  <span className={`badge ${s.active ? 'badge-ok' : 'badge-danger'}`}>
                    {s.active ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>
                <div className="muted mono" style={{ fontSize: 12 }}>
                  {s.url}
                </div>
                <div style={{ margin: '4px 0' }}>
                  {s.eventTypes.map((e) => (
                    <span
                      key={e}
                      className="badge badge-accent"
                      style={{ marginRight: 4, fontSize: 11 }}
                    >
                      {e}
                    </span>
                  ))}
                </div>
                {h ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    ✅ {h.delivered} delivered · ⏳ {h.pending} pending · ⚠️ {h.failed} failing · ☠️{' '}
                    {h.dead} dead
                    {h.lastDeliveredAt
                      ? ` · last: ${new Date(h.lastDeliveredAt).toLocaleString()}`
                      : ''}
                  </div>
                ) : null}
                {can('integration.manage') ? (
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 6 }}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          api(
                            'POST',
                            `/api/v1/integrations/webhooks/${s.id}/${s.active ? 'disable' : 'activate'}`,
                          ),
                        null,
                      )
                    }
                    type="button"
                  >
                    {s.active ? 'Disable' : 'Activate'}
                  </button>
                ) : null}
              </div>
            );
          })}

          {can('integration.manage') ? (
            <form
              style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const created = await api<{ secret: string }>(
                    'POST',
                    '/api/v1/integrations/webhooks',
                    { name, url, eventTypes: events },
                  );
                  setSecretOnce(created.secret);
                  setName('');
                  setUrl('');
                }, 'Webhook subscription created.');
              }}
            >
              <div className="row">
                <input
                  className="input"
                  style={{ maxWidth: 160 }}
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <input
                  className="input mono"
                  placeholder="https://example.com/hooks/nexora"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div style={{ margin: '8px 0' }}>
                {SUGGESTED_EVENTS.map((e) => (
                  <label
                    key={e}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginRight: 10,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(e)}
                      onChange={(ev) =>
                        setEvents((current) =>
                          ev.target.checked ? [...current, e] : current.filter((x) => x !== e),
                        )
                      }
                    />
                    <span className="mono">{e}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={busy || events.length === 0}
                type="submit"
              >
                Create subscription
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Delivery history</h2>
          {deliveries.length === 0 ? <div className="empty">No deliveries yet.</div> : null}
          {deliveries.length > 0 ? (
            <table className="table">
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12 }}>
                        {d.eventType}
                      </span>
                      {d.lastError ? (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {d.lastError}
                        </div>
                      ) : null}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge ${STATUS_BADGE[d.status]}`}>
                        {d.status}
                        {d.attempts > 0 ? ` ×${d.attempts}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </main>
  );
}
