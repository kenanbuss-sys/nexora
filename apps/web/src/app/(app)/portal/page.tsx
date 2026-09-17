'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

interface PortalMe {
  accountId: string;
  accountNumber: string;
  accountName: string;
  displayName: string;
  credit: { invoiced: string; paid: string; openBalance: string };
}

interface CatalogItem {
  skuId: string;
  code: string;
  name: string;
  unitPrice: string | null;
}

interface PortalOrder {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
  createdAt?: string;
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

interface PortalClaim {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
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

/**
 * Portal amounts without an explicit API currency (contract prices, cart
 * total, credit summary) are in the server's portal currency: placeOrder
 * defaults to EUR and the portal never sends another one.
 */
const PORTAL_CURRENCY = 'EUR';

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  ON_HOLD: 'Na čekanju',
  FULFILLED: 'Ispunjena',
  CANCELLED: 'Otkazana',
};

const ORDER_BADGE: Record<string, string> = {
  DRAFT: 'badge-warn',
  CONFIRMED: 'badge-accent',
  ON_HOLD: 'badge-warn',
  FULFILLED: 'badge-ok',
  CANCELLED: 'badge-danger',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Otvorena',
  PARTIALLY_PAID: 'Djelimično plaćena',
  PAID: 'Plaćena',
  VOID: 'Stornirana',
};

const CLAIM_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Otvorena',
  IN_PROGRESS: 'U obradi',
  RESOLVED: 'Riješena',
  CLOSED: 'Zatvorena',
};

const orderStatusLabel = (s: string) => ORDER_STATUS_LABELS[s] ?? s.replace(/_/g, ' ');
const claimStatusLabel = (s: string) => CLAIM_STATUS_LABELS[s] ?? s.replace(/_/g, ' ');
const invoiceStatusLabel = (s: string) => INVOICE_STATUS_LABELS[s] ?? s.replace(/_/g, ' ');

export default function PortalPage() {
  const { can } = useApp();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PortalOrder[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [timeline, setTimeline] = useState<Record<string, TimelineEvent[]>>({});
  const [portalUsers, setPortalUsers] = useState<PortalUserView[]>([]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cart, setCart] = useState<Record<string, string>>({});
  // Sprint 222: one idempotency key per intended order. After an
  // uncertain outcome the key AND the submitted content are kept until
  // the submission resolves — a later cart edit can never silently
  // turn the retry into a new order (the retry resends the pending
  // content; the edited cart becomes a new order afterwards).
  const pendingOrderRef = useRef<{
    key: string;
    lines: Array<{ skuId: string; quantity: number }>;
  } | null>(null);
  const [confirmOrder, setConfirmOrder] = useState(false);
  const [claims, setClaims] = useState<PortalClaim[]>([]);
  const [claimOrder, setClaimOrder] = useState('');
  const [claimSubject, setClaimSubject] = useState('');
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
      api<{ catalog: CatalogItem[] }>('GET', '/api/v1/portal/catalog')
        .then((r) => setCatalog(r.catalog))
        .catch(() => setCatalog([]));
      api<{ orders: PortalOrder[] }>('GET', '/api/v1/portal/orders')
        .then((r) => setOrders(r.orders))
        .catch(() => setOrders([]));
      api<{ invoices: PortalInvoice[] }>('GET', '/api/v1/portal/invoices')
        .then((r) => setInvoices(r.invoices))
        .catch(() => setInvoices([]));
      api<{ claims: PortalClaim[] }>('GET', '/api/v1/portal/claims')
        .then((r) => setClaims(r.claims))
        .catch(() => setClaims([]));
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

  // Cart lines joined against server catalog prices; the only local math
  // allowed is quantity × server unit price for display — the server
  // re-prices on submit.
  const cartLines = Object.entries(cart)
    .map(([skuId, qty]) => {
      const item = (catalog ?? []).find((c) => c.skuId === skuId);
      const quantity = Number(qty);
      if (!item || item.unitPrice === null || !(quantity > 0)) return null;
      return {
        skuId,
        code: item.code,
        name: item.name,
        quantity,
        unitPrice: item.unitPrice,
        lineTotal: quantity * Number(item.unitPrice),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.lineTotal, 0);

  function addToCart(skuId: string) {
    setCart((c) => {
      const current = Number(c[skuId]);
      return { ...c, [skuId]: String(Number.isFinite(current) && current > 0 ? current + 1 : 1) };
    });
  }

  const catalogColumns: Array<Column<CatalogItem>> = [
    {
      key: 'code',
      header: 'Šifra',
      render: (c) => <span className="mono">{c.code}</span>,
      text: (c) => c.code,
    },
    { key: 'name', header: 'Naziv', render: (c) => c.name, text: (c) => c.name },
    {
      key: 'price',
      header: 'Cijena',
      align: 'right',
      render: (c) =>
        c.unitPrice !== null ? (
          <span className="mono">
            {c.unitPrice} {PORTAL_CURRENCY}
          </span>
        ) : (
          <span className="muted">Na upit</span>
        ),
      text: (c) => (c.unitPrice !== null ? `${c.unitPrice} ${PORTAL_CURRENCY}` : 'Na upit'),
    },
    {
      key: 'add',
      header: '',
      align: 'right',
      render: (c) => (
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || c.unitPrice === null}
          title={c.unitPrice === null ? 'Artikal bez ugovorene cijene — na upit' : undefined}
          onClick={() => addToCart(c.skuId)}
        >
          Dodaj u korpu
        </button>
      ),
    },
  ];

  const orderColumns: Array<Column<PortalOrder>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (o) => <span className="mono">{o.orderNumber}</span>,
      text: (o) => o.orderNumber,
    },
    {
      key: 'date',
      header: 'Datum',
      render: (o) => (o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'),
      text: (o) => (o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ''),
    },
    {
      key: 'total',
      header: 'Iznos',
      align: 'right',
      render: (o) => (
        <span className="mono">
          {o.total} {o.currency}
        </span>
      ),
      text: (o) => `${o.total} ${o.currency}`,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (o) => (
        <span className={`badge ${ORDER_BADGE[o.status] ?? ''}`}>{orderStatusLabel(o.status)}</span>
      ),
      text: (o) => orderStatusLabel(o.status),
    },
  ];

  const openTimelines = (orders ?? []).filter((o) => timeline[o.id]);

  return (
    <main className="page">
      <h1>B2B portal</h1>
      <p className="page-sub">
        {me ? <strong>{me.accountName}</strong> : 'Samoposlužni portal za kupce'} — narudžbe,
        proizvodni koraci, fakture i saldo, ograničeno serverski na vlastiti račun.
      </p>
      <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
        Dev prijava (razvojni identiteti) — produkcija koristi OIDC prijavu vašeg dobavljača.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {isCustomer ? (
        me ? (
          <>
            <div className="grid-4" style={{ marginBottom: 16 }}>
              <div className="card stat">
                <div className="stat-label">Kupac</div>
                <div className="stat-value" style={{ fontSize: 18 }}>
                  {me.accountName}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {me.accountNumber}
                </div>
              </div>
              <div className="card stat">
                <div className="stat-label">Fakturisano</div>
                <div className="stat-value">
                  {me.credit.invoiced} {PORTAL_CURRENCY}
                </div>
              </div>
              <div className="card stat">
                <div className="stat-label">Plaćeno</div>
                <div className="stat-value">
                  {me.credit.paid} {PORTAL_CURRENCY}
                </div>
              </div>
              <div className="card stat">
                <div className="stat-label">Otvoreni saldo</div>
                <div className="stat-value">
                  {me.credit.openBalance} {PORTAL_CURRENCY}
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <h2>Moj katalog</h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  Artikli iz vašeg ugovorenog cjenovnika, po vašim cijenama.
                </p>
                {catalog === null ? (
                  <LoadingState text="Učitavanje kataloga…" />
                ) : catalog.length === 0 ? (
                  <EmptyState text="Nemate ugovoreni cjenovnik — obratite se svom menadžeru prodaje." />
                ) : (
                  <DataTable
                    columns={catalogColumns}
                    rows={catalog}
                    rowKey={(c) => c.skuId}
                    searchPlaceholder="Pretraga kataloga…"
                    emptyText="Nemate ugovoreni cjenovnik — obratite se svom menadžeru prodaje."
                  />
                )}

                {cartLines.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <h3 style={{ marginBottom: 6 }}>Korpa</h3>
                    {cartLines.map((l) => (
                      <div key={l.skuId} className="row spread" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>
                          <span className="mono">{l.code}</span>{' '}
                          <span className="muted">
                            × {l.unitPrice} {PORTAL_CURRENCY}
                          </span>
                        </span>
                        <span className="row">
                          <input
                            className="input"
                            style={{ width: 70 }}
                            aria-label={`Količina za ${l.code}`}
                            value={cart[l.skuId] ?? ''}
                            onChange={(e) => setCart({ ...cart, [l.skuId]: e.target.value })}
                          />
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setCart((c) => {
                                const next = { ...c };
                                delete next[l.skuId];
                                return next;
                              })
                            }
                          >
                            Ukloni
                          </button>
                        </span>
                      </div>
                    ))}
                    <div className="row spread" style={{ marginTop: 8 }}>
                      <strong>
                        Ukupno: {cartTotal.toFixed(2)} {PORTAL_CURRENCY}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy || cartLines.length === 0}
                        onClick={() => setConfirmOrder(true)}
                      >
                        Predaj narudžbu
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="card">
                <h2>Moje narudžbe</h2>
                {orders === null ? (
                  <LoadingState text="Učitavanje narudžbi…" />
                ) : (
                  <DataTable
                    columns={orderColumns}
                    rows={orders}
                    rowKey={(o) => o.id}
                    onRowClick={(o) => toggleTimeline(o.id)}
                    searchPlaceholder="Pretraga narudžbi…"
                    emptyText="Još nema narudžbi."
                  />
                )}
                {openTimelines.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 10,
                    }}
                  >
                    <div className="spread">
                      <strong className="mono">{o.orderNumber}</strong>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => toggleTimeline(o.id)}
                      >
                        Sakrij tok
                      </button>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {timeline[o.id]!.length === 0 ? (
                        <EmptyState text="Još nema događaja za ovu narudžbu." />
                      ) : (
                        timeline[o.id]!.map((ev, index) => (
                          <div key={index} className="muted" style={{ fontSize: 12 }}>
                            <span className="mono">{new Date(ev.createdAt).toLocaleString()}</span>{' '}
                            — {ev.eventType}
                            {ev.note ? ` (${ev.note})` : ''}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>Moje reklamacije</h2>
                {claims.length === 0 ? <EmptyState text="Još nema reklamacija." /> : null}
                {claims.map((cl) => (
                  <div key={cl.id} className="row spread" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      <strong className="mono">{cl.caseNumber}</strong> {cl.subject}
                    </span>
                    <span className={`badge ${cl.status === 'OPEN' ? 'badge-warn' : 'badge-ok'}`}>
                      {claimStatusLabel(cl.status)}
                    </span>
                  </div>
                ))}
                {(orders ?? []).length > 0 ? (
                  <form
                    className="row"
                    style={{ marginTop: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api('POST', '/api/v1/portal/claims', {
                          orderId: claimOrder,
                          subject: claimSubject,
                        });
                        setClaimSubject('');
                        setNotice('Reklamacija zaprimljena — servisni tim će vam se javiti.');
                      }, null);
                    }}
                  >
                    <select
                      className="input"
                      value={claimOrder}
                      onChange={(e) => setClaimOrder(e.target.value)}
                      required
                    >
                      <option value="">Narudžba…</option>
                      {(orders ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      placeholder="Šta nije u redu?"
                      value={claimSubject}
                      onChange={(e) => setClaimSubject(e.target.value)}
                      required
                    />
                    <button className="btn btn-sm" disabled={busy} type="submit">
                      Podnesi reklamaciju
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="card">
                <h2>Moje fakture</h2>
                {invoices.length === 0 ? <EmptyState text="Još nema faktura." /> : null}
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
                              {invoiceStatusLabel(i.status)}
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
          <ErrorState text={meError} />
        ) : (
          <LoadingState text="Učitavanje vašeg radnog prostora…" />
        )
      ) : null}

      {isManager ? (
        <div className="card" style={{ marginTop: isCustomer ? 16 : 0 }}>
          <h2>Pristup portalu (back office)</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Vežite identitet kupca na račun. Isti subjekt pozovite i kao korisnika s ulogom koja
            daje <span className="mono">portal.access</span>.
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
                        {u.status === 'ACTIVE' ? 'Aktivan' : 'Onemogućen'}
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
                        {u.status === 'ACTIVE' ? 'Onemogući' : 'Aktiviraj'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState text="Još nema portal korisnika." />
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
                'Portal korisnik vezan na račun.',
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
              <option value="">Račun…</option>
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
              placeholder="Prikazno ime"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
              Veži portal korisnika
            </button>
          </form>
        </div>
      ) : null}

      {!isCustomer && !isManager ? (
        <EmptyState text="Nemate pristup B2B portalu — zatražite od administratora ulogu s dozvolom portal.access (kupac) ili portal.manage (back office)." />
      ) : null}

      {confirmOrder && me ? (
        <ConfirmDialog
          open
          title={pendingOrderRef.current ? 'Ponovna predaja narudžbe' : 'Predaja narudžbe'}
          consequence={
            pendingOrderRef.current
              ? 'Prethodna predaja nije potvrđena — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata). Izmjene korpe idu u novu narudžbu nakon razrješenja.'
              : 'Narudžba se predaje vašem dobavljaču na obradu; server ponovo obračunava cijene iz vašeg ugovorenog cjenovnika.'
          }
          confirmLabel="Potvrdi narudžbu"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              // An unresolved earlier submission is retried verbatim
              // (same key, same content); otherwise this cart becomes
              // the pending submission under a fresh key.
              if (!pendingOrderRef.current) {
                pendingOrderRef.current = {
                  key: crypto.randomUUID().replace(/-/g, ''),
                  lines: cartLines.map((l) => ({ skuId: l.skuId, quantity: l.quantity })),
                };
              }
              const pending = pendingOrderRef.current;
              let r: { id: string; orderNumber: string };
              try {
                r = await api<{ id: string; orderNumber: string }>(
                  'POST',
                  '/api/v1/portal/orders',
                  { lines: pending.lines, requestKey: pending.key },
                );
              } catch (e) {
                // A definitive rejection (4xx) means no order was
                // created — the submission is resolved and a corrected
                // cart may start fresh. An uncertain outcome (network,
                // 5xx) keeps key and content for a safe retry.
                if (e instanceof ApiRequestError && e.status < 500) {
                  pendingOrderRef.current = null;
                }
                throw e;
              }
              pendingOrderRef.current = null;
              setCart({});
              setConfirmOrder(false);
              setNotice(`Narudžba ${r.orderNumber} je predata — hvala.`);
            }, null)
          }
          onCancel={() => setConfirmOrder(false)}
        >
          <div className="fact">
            <span>Kupac</span>
            <span>{me.accountName}</span>
          </div>
          {(pendingOrderRef.current
            ? pendingOrderRef.current.lines.map((p) => {
                const c = (catalog ?? []).find((x) => x.skuId === p.skuId);
                const price = c?.unitPrice !== null && c !== undefined ? Number(c.unitPrice) : 0;
                return {
                  skuId: p.skuId,
                  code: c?.code ?? p.skuId,
                  quantity: p.quantity,
                  unitPrice: price,
                  lineTotal: Math.round(price * p.quantity * 100) / 100,
                };
              })
            : cartLines
          ).map((l) => (
            <div key={l.skuId} className="fact">
              <span className="mono">{l.code}</span>
              <span className="mono">
                {l.quantity} × {l.unitPrice} = {l.lineTotal.toFixed(2)} {PORTAL_CURRENCY}
              </span>
            </div>
          ))}
          {pendingOrderRef.current ? null : (
            <div className="fact">
              <span>Ukupno</span>
              <span className="mono">
                {cartTotal.toFixed(2)} {PORTAL_CURRENCY}
              </span>
            </div>
          )}
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
