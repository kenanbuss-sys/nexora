'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface PortalMe {
  accountId: string;
  accountNumber: string;
  accountName: string;
  displayName: string;
  credit: { invoiced: string; paid: string; openBalance: string };
}

interface PortalOrder {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
  lines: Array<{ description: string; quantity: string; lineTotal: string }>;
}

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  currency: string;
  total: string;
  paidAmount: string;
  status: string;
  dueAt: string | null;
}

interface PortalUserView {
  id: string;
  accountId: string;
  idpSubject: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED';
}

interface AccountView {
  id: string;
  partyName: string;
  accountNumber: string;
}

interface TimelineEvent {
  eventType: string;
  note: string | null;
  createdAt: string;
}

export default function PortalPage() {
  const { can } = useApp();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [timeline, setTimeline] = useState<Record<string, TimelineEvent[]>>({});
  const [portalUsers, setPortalUsers] = useState<PortalUserView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newAccount, setNewAccount] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newName, setNewName] = useState('');

  const isCustomer = can('portal.access');
  const isManager = can('portal.manage');

  const load = useCallback(() => {
    if (isCustomer) {
      api<PortalMe>('GET', '/api/v1/portal/me')
        .then((r) => {
          setMe(r);
          setMeError(null);
        })
        .catch((e: unknown) => setMeError(errorText(e)));
      api<{ orders: PortalOrder[] }>('GET', '/api/v1/portal/orders')
        .then((r) => setOrders(r.orders))
        .catch(() => setOrders([]));
      api<{ invoices: PortalInvoice[] }>('GET', '/api/v1/portal/invoices')
        .then((r) => setInvoices(r.invoices))
        .catch(() => setInvoices([]));
    }
    if (isManager) {
      api<{ portalUsers: PortalUserView[] }>('GET', '/api/v1/portal-users')
        .then((r) => setPortalUsers(r.portalUsers))
        .catch(() => setPortalUsers([]));
      api<{ accounts: AccountView[] }>('GET', '/api/v1/crm/accounts')
        .then((r) => setAccounts(r.accounts))
        .catch(() => setAccounts([]));
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

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

  function toggleTimeline(orderId: string) {
    if (timeline[orderId]) {
      setTimeline((t) => {
        const next = { ...t };
        delete next[orderId];
        return next;
      });
      return;
    }
    api<{ events: TimelineEvent[] }>('GET', `/api/v1/portal/orders/${orderId}/timeline`)
      .then((r) => setTimeline((t) => ({ ...t, [orderId]: r.events })))
      .catch(() => undefined);
  }

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Customer portal</h1>
      <p className="page-sub">
        Self-service for customer companies — orders, production milestones, invoices and balance,
        scoped server-side to their own account.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {isCustomer ? (
        me ? (
          <>
            <div className="grid-4" style={{ marginBottom: 16 }}>
              <div className="card stat">
                <div className="stat-label">Company</div>
                <div className="stat-value" style={{ fontSize: 18 }}>
                  {me.accountName}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {me.accountNumber}
                </div>
              </div>
              <div className="card stat">
                <div className="stat-label">Invoiced</div>
                <div className="stat-value">{me.credit.invoiced}</div>
              </div>
              <div className="card stat">
                <div className="stat-label">Paid</div>
                <div className="stat-value">{me.credit.paid}</div>
              </div>
              <div className="card stat">
                <div className="stat-label">Open balance</div>
                <div className="stat-value">{me.credit.openBalance}</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <h2>My orders</h2>
                {orders.length === 0 ? <div className="empty">No orders yet.</div> : null}
                {orders.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <div className="spread">
                      <strong className="mono">{o.orderNumber}</strong>
                      <span className="badge badge-accent">{o.status.replace('_', ' ')}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {o.total} {o.currency}
                    </div>
                    <button
                      className="btn btn-sm"
                      style={{ marginTop: 6 }}
                      onClick={() => toggleTimeline(o.id)}
                      type="button"
                    >
                      {timeline[o.id] ? 'Hide progress' : 'Track progress'}
                    </button>
                    {timeline[o.id] ? (
                      <div style={{ marginTop: 6 }}>
                        {timeline[o.id]!.map((ev, index) => (
                          <div key={index} className="muted" style={{ fontSize: 12 }}>
                            <span className="mono">{new Date(ev.createdAt).toLocaleString()}</span>{' '}
                            — {ev.eventType}
                            {ev.note ? ` (${ev.note})` : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>My invoices</h2>
                {invoices.length === 0 ? <div className="empty">No invoices yet.</div> : null}
                {invoices.length > 0 ? (
                  <table className="table">
                    <tbody>
                      {invoices.map((i) => (
                        <tr key={i.id}>
                          <td className="mono">{i.invoiceNumber}</td>
                          <td>
                            {i.paidAmount} / {i.total} {i.currency}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              className={`badge ${i.status === 'PAID' ? 'badge-ok' : 'badge-warn'}`}
                            >
                              {i.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>
          </>
        ) : meError ? (
          <div className="alert alert-error">{meError}</div>
        ) : (
          <div className="loading">Loading your workspace…</div>
        )
      ) : null}

      {isManager ? (
        <div className="card" style={{ marginTop: isCustomer ? 16 : 0 }}>
          <h2>Portal access (back office)</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Bind a customer identity to an account. Also invite the same subject as a user with a
            role granting <span className="mono">portal.access</span>.
          </p>
          {portalUsers.length > 0 ? (
            <table className="table">
              <tbody>
                {portalUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.displayName}
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        {u.idpSubject}
                      </div>
                    </td>
                    <td>{accountName(u.accountId)}</td>
                    <td>
                      <span
                        className={`badge ${u.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(
                                'POST',
                                `/api/v1/portal-users/${u.id}/${u.status === 'ACTIVE' ? 'disable' : 'activate'}`,
                              ),
                            null,
                          )
                        }
                        type="button"
                      >
                        {u.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No portal users yet.</div>
          )}
          <form
            className="row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  api('POST', '/api/v1/portal-users', {
                    accountId: newAccount,
                    idpSubject: newSubject,
                    displayName: newName,
                  }),
                'Portal user bound to the account.',
              ).then(() => {
                setNewSubject('');
                setNewName('');
              });
            }}
          >
            <select
              className="select"
              style={{ maxWidth: 200 }}
              value={newAccount}
              onChange={(e) => setNewAccount(e.target.value)}
              required
            >
              <option value="">Account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} — {a.partyName}
                </option>
              ))}
            </select>
            <input
              className="input mono"
              style={{ maxWidth: 180 }}
              placeholder="idp|customer1"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              required
            />
            <input
              className="input"
              style={{ maxWidth: 160 }}
              placeholder="Display name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
              Bind portal user
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
