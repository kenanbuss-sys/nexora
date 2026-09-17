'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import { CollabPanel } from '../collab-panel';
import { downloadDocument } from '../../../lib/download';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

interface OrderLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  reservationId: string | null;
  backordered: boolean;
  fulfilledQty?: string;
}

interface OrderView {
  id: string;
  orderNumber: string;
  accountId: string;
  quoteId: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'ON_HOLD' | 'FULFILLED' | 'CANCELLED';
  currency: string;
  total: string;
  holdReason: string | null;
  lines: OrderLineView[];
  fulfillmentType?: string;
  projectRef?: string | null;
}

interface ReturnView {
  id: string;
  rmaNumber: string;
  orderId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'CLOSED';
  reason: string;
  lines: Array<{ id: string; description: string; quantity: string }>;
}

interface OrderEventView {
  id: string;
  eventType: string;
  note: string | null;
  createdAt: string;
}

interface AccountView {
  id: string;
  partyName: string;
  accountNumber: string;
}

interface WarehouseView {
  id: string;
  code: string;
  name: string;
}

interface QuoteOption {
  id: string;
  quoteNumber: string;
  status: string;
  total: string;
  currency: string;
}

interface SkuOption {
  id: string;
  code: string;
}

const ORDER_BADGE: Record<OrderView['status'], string> = {
  DRAFT: 'badge-warn',
  CONFIRMED: 'badge-accent',
  ON_HOLD: 'badge-warn',
  FULFILLED: 'badge-ok',
  CANCELLED: 'badge-danger',
};

const STATUS_LABELS: Record<OrderView['status'], string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  ON_HOLD: 'Na čekanju',
  FULFILLED: 'Ispunjena',
  CANCELLED: 'Otkazana',
};

const RETURN_STATUS_LABELS: Record<ReturnView['status'], string> = {
  REQUESTED: 'Zatražen',
  APPROVED: 'Odobren',
  REJECTED: 'Odbijen',
  RECEIVED: 'Zaprimljen',
  CLOSED: 'Zatvoren',
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  PACKED: 'Zapakovan',
  STAGED: 'Pripremljen',
  SHIPPED: 'Otpremljen',
};

export default function OrdersPage() {
  const { can } = useApp();
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [logistics, setLogistics] = useState<
    Record<string, { totalWeightKg: string; totalVolumeM3: string; linesMissingData: number }>
  >({});
  const [promises, setPromises] = useState<
    Record<string, { orderPromise: string; fromStockCount: number; total: number }>
  >({});
  const [alternatives, setAlternatives] = useState<
    Record<string, Array<{ substituteSkuId: string; substituteCode: string; available: string }>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [packages, setPackages] = useState<
    Array<{
      id: string;
      packageNumber: string;
      orderNumber: string;
      status: string;
      lines: Array<{ description: string; quantity: string }>;
    }>
  >([]);
  const [busy, setBusy] = useState(false);

  const [newAccount, setNewAccount] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newCurrency, setNewCurrency] = useState('EUR');
  const [newFulfillment, setNewFulfillment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [newProjectRef, setNewProjectRef] = useState('');
  const [fromQuote, setFromQuote] = useState('');
  const [fromQuoteWarehouse, setFromQuoteWarehouse] = useState('');

  const [lineOrder, setLineOrder] = useState('');
  const [lineSku, setLineSku] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('');
  const [holdOrder, setHoldOrder] = useState('');
  const [promoOrder, setPromoOrder] = useState('');
  const [quickText, setQuickText] = useState('');
  const [quickAccount, setQuickAccount] = useState('');
  const [quickWarehouse, setQuickWarehouse] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [timeline, setTimeline] = useState<Record<string, OrderEventView[]>>({});
  const [discussion, setDiscussion] = useState<Record<string, boolean>>({});
  const [returns, setReturns] = useState<ReturnView[]>([]);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | OrderView['status']>('');

  const load = useCallback(() => {
    api<{ packages: typeof packages }>('GET', '/api/v1/packages')
      .then((r) => setPackages(r.packages))
      .catch(() => setPackages([]));
    api<{ orders: OrderView[] }>('GET', '/api/v1/orders')
      .then((r) => {
        setOrders(r.orders);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    if (can('quote.read')) {
      api<{ quotes: QuoteOption[] }>('GET', '/api/v1/quotes?status=ACCEPTED')
        .then((r) => setQuotes(r.quotes))
        .catch(() => setQuotes([]));
    }
    api<{ returns: ReturnView[] }>('GET', '/api/v1/returns')
      .then((r) => setReturns(r.returns))
      .catch(() => setReturns([]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ accounts: AccountView[] }>('GET', '/api/v1/crm/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch(() => undefined);
    api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
      .then((r) => {
        setWarehouses(r.warehouses);
        const first = r.warehouses[0];
        if (first) {
          setNewWarehouse(first.id);
          setFromQuoteWarehouse(first.id);
        }
      })
      .catch(() => undefined);
    api<{ products: Array<{ id: string }> }>('GET', '/api/v1/products/search')
      .then(async (r) => {
        const details = await Promise.all(
          r.products
            .slice(0, 20)
            .map((p) =>
              api<{ skus: Array<{ id: string; code: string }> }>('GET', `/api/v1/products/${p.id}`),
            ),
        );
        setSkus(details.flatMap((d) => d.skus));
      })
      .catch(() => undefined);
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
    api<{ events: OrderEventView[] }>('GET', `/api/v1/orders/${orderId}/timeline`)
      .then((r) => setTimeline((t) => ({ ...t, [orderId]: r.events })))
      .catch(() => undefined);
  }

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  const orderRows = (orders ?? []).filter((o) => !statusFilter || o.status === statusFilter);
  const opened = openOrder ? (orders ?? []).find((o) => o.id === openOrder) : undefined;

  const orderColumns: Array<Column<OrderView>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (o) => <strong className="mono">{o.orderNumber}</strong>,
      text: (o) => o.orderNumber,
    },
    {
      key: 'account',
      header: 'Kupac',
      render: (o) => accountName(o.accountId),
      text: (o) => accountName(o.accountId),
    },
    {
      key: 'tags',
      header: 'Oznake',
      render: (o) => (
        <>
          {o.fulfillmentType === 'PICKUP' ? (
            <span className="badge badge-accent" style={{ marginRight: 6 }}>
              Preuzimanje
            </span>
          ) : null}
          {o.projectRef ? (
            <span className="badge" style={{ marginRight: 6 }}>
              {o.projectRef}
            </span>
          ) : null}
          {o.quoteId ? (
            <span className="muted" style={{ fontSize: 12 }}>
              iz ponude
            </span>
          ) : null}
        </>
      ),
      text: (o) => o.projectRef ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <span className={`badge ${ORDER_BADGE[o.status]}`}>{STATUS_LABELS[o.status]}</span>
      ),
      text: (o) => STATUS_LABELS[o.status],
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
  ];

  return (
    <main className="page">
      <div className="spread">
        <h1>Narudžbe</h1>
        <Link className="btn btn-sm" href="/inventory">
          Zalihe →
        </Link>
      </div>
      <p className="page-sub">
        Kanonske prodajne narudžbe — potvrda rezerviše zalihe u skladištu; fulfilment (ispunjenje)
        knjiži stvarni izlaz robe iz ledgera; otkazivanje oslobađa rezervacije.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {can('order.confirm') ? (
        <>
          <button
            className="btn btn-sm"
            style={{ marginBottom: 12 }}
            type="button"
            onClick={() =>
              run(async () => {
                const r = await api<{ report: Array<{ allocated: boolean }> }>(
                  'POST',
                  '/api/v1/orders/allocate-backorders',
                );
                const done = r.report.filter((x) => x.allocated).length;
                setNotice(`Alokacija: ${done}/${r.report.length} linija u zaostatku alocirano.`);
              }, null)
            }
          >
            Alociraj zaostatke
          </button>
          <button
            className="btn btn-sm"
            style={{ marginBottom: 12, marginLeft: 8 }}
            type="button"
            onClick={() =>
              run(async () => {
                const r = await api<{ notified: number; skipped: number }>(
                  'POST',
                  '/api/v1/orders/abandoned/notify?hours=24',
                );
                setNotice(
                  `Napušteni nacrti: ${r.notified} obaviješteno, ${r.skipped} već obrađeno.`,
                );
              }, null)
            }
          >
            Podsjeti na napuštene nacrte
          </button>
        </>
      ) : null}

      <div className="grid-2">
        <div>
          {can('order.create') ? (
            <>
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/orders', {
                        accountId: newAccount,
                        warehouseId: newWarehouse,
                        currency: newCurrency,
                        fulfillmentType: newFulfillment,
                        ...(newProjectRef ? { projectRef: newProjectRef } : {}),
                      }),
                    'Narudžba kreirana (nacrt).',
                  );
                }}
              >
                <h2>Nova narudžba</h2>
                <label className="label">Kupac</label>
                <select
                  className="select"
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  required
                >
                  <option value="">Odaberite kupca…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber} — {a.partyName}
                    </option>
                  ))}
                </select>
                <label className="label">Skladište</label>
                <select
                  className="select"
                  value={newWarehouse}
                  onChange={(e) => setNewWarehouse(e.target.value)}
                  required
                >
                  <option value="">Odaberite…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
                <label className="label">Način ispunjenja</label>
                <select
                  className="select"
                  value={newFulfillment}
                  onChange={(e) => setNewFulfillment(e.target.value as 'DELIVERY' | 'PICKUP')}
                >
                  <option value="DELIVERY">Dostava</option>
                  <option value="PICKUP">Preuzimanje (click &amp; collect)</option>
                </select>
                <label className="label">Referenca projekta (opcionalno)</label>
                <input
                  className="input"
                  value={newProjectRef}
                  onChange={(e) => setNewProjectRef(e.target.value)}
                />
                <label className="label">Valuta</label>
                <input
                  className="input mono"
                  style={{ maxWidth: 90 }}
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Kreiraj narudžbu
                </button>
              </form>

              {quotes.length > 0 ? (
                <form
                  className="card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api('POST', '/api/v1/orders/from-quote', {
                          quoteId: fromQuote,
                          warehouseId: fromQuoteWarehouse,
                        }),
                      'Narudžba kreirana iz prihvaćene ponude.',
                    );
                  }}
                >
                  <h2>Iz prihvaćene ponude</h2>
                  <label className="label">Ponuda</label>
                  <select
                    className="select"
                    value={fromQuote}
                    onChange={(e) => setFromQuote(e.target.value)}
                    required
                  >
                    <option value="">Odaberite ponudu…</option>
                    {quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quoteNumber} — {q.total} {q.currency}
                      </option>
                    ))}
                  </select>
                  <label className="label">Ispuni iz skladišta</label>
                  <select
                    className="select"
                    value={fromQuoteWarehouse}
                    onChange={(e) => setFromQuoteWarehouse(e.target.value)}
                    required
                  >
                    <option value="">Odaberite…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 14 }}
                    disabled={busy}
                    type="submit"
                  >
                    Pretvori u narudžbu
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="card">
          <h2>Prodajne narudžbe</h2>
          {orders === null && !error ? <LoadingState text="Učitavanje narudžbi…" /> : null}
          {orders !== null ? (
            <DataTable
              columns={orderColumns}
              rows={orderRows}
              rowKey={(o) => o.id}
              onRowClick={(o) => setOpenOrder((prev) => (prev === o.id ? null : o.id))}
              searchPlaceholder="Pretraga narudžbi…"
              pageSize={10}
              emptyText={
                statusFilter
                  ? 'Nema narudžbi za odabrani status.'
                  : 'Još nema narudžbi — kreirajte novu ili pretvorite prihvaćenu ponudu.'
              }
              toolbar={
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as '' | OrderView['status'])}
                  aria-label="Filter po statusu"
                >
                  <option value="">Svi statusi</option>
                  {(Object.keys(STATUS_LABELS) as Array<OrderView['status']>).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              }
            />
          ) : null}

          {opened ? (
            <div
              key={opened.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
              }}
            >
              {(() => {
                const o = opened;
                return (
                  <>
                    <div className="spread">
                      <div>
                        <strong className="mono">{o.orderNumber}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {accountName(o.accountId)} · {o.total} {o.currency}
                          {o.quoteId ? ' · iz ponude' : ''}
                        </div>
                      </div>
                      <span>
                        {o.fulfillmentType === 'PICKUP' ? (
                          <span className="badge badge-accent" style={{ marginRight: 6 }}>
                            Preuzimanje
                          </span>
                        ) : null}
                        {o.projectRef ? (
                          <span className="badge" style={{ marginRight: 6 }}>
                            {o.projectRef}
                          </span>
                        ) : null}
                        <span className={`badge ${ORDER_BADGE[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </span>
                      </span>
                    </div>
                    {o.status === 'ON_HOLD' && o.holdReason ? (
                      <div className="alert alert-error" style={{ marginTop: 8 }}>
                        Na čekanju: {o.holdReason}
                      </div>
                    ) : null}

                    {o.lines.length > 0 ? (
                      <table className="table" style={{ marginTop: 8 }}>
                        <tbody>
                          {o.lines.map((l) => (
                            <tr key={l.id}>
                              <td>{l.description}</td>
                              <td>
                                {l.quantity} × {l.unitPrice}
                                {Number(l.fulfilledQty ?? 0) > 0 ? (
                                  <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                                    isporučeno {l.fulfilledQty}
                                  </span>
                                ) : null}
                                {l.reservationId ? (
                                  <span className="badge badge-accent" style={{ marginLeft: 6 }}>
                                    rezervisano
                                  </span>
                                ) : null}
                                {l.backordered ? (
                                  <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                                    zaostatak
                                  </span>
                                ) : null}
                                {l.backordered ? (
                                  alternatives[l.skuId] ? (
                                    alternatives[l.skuId]!.length > 0 ? (
                                      <span
                                        className="muted"
                                        style={{ marginLeft: 6, fontSize: 12 }}
                                      >
                                        Alternative:{' '}
                                        {alternatives[l.skuId]!.map((a) => (
                                          <span key={a.substituteSkuId} style={{ marginRight: 6 }}>
                                            {a.substituteCode} ({a.available})
                                            {can('order.create') ? (
                                              <button
                                                className="btn btn-sm"
                                                style={{ marginLeft: 2, padding: '0 6px' }}
                                                disabled={busy}
                                                type="button"
                                                title="Zamijeni ovu liniju alternativnim artiklom"
                                                onClick={() =>
                                                  run(
                                                    () =>
                                                      api(
                                                        'POST',
                                                        `/api/v1/orders/${o.id}/lines/${l.id}/substitute`,
                                                        { substituteSkuId: a.substituteSkuId },
                                                      ),
                                                    'Linija zamijenjena.',
                                                  )
                                                }
                                              >
                                                Koristi
                                              </button>
                                            ) : null}
                                          </span>
                                        ))}
                                      </span>
                                    ) : null
                                  ) : (
                                    <button
                                      className="btn btn-sm"
                                      style={{ marginLeft: 6, padding: '1px 8px' }}
                                      type="button"
                                      onClick={() => {
                                        api<{
                                          alternatives: Array<{
                                            substituteSkuId: string;
                                            substituteCode: string;
                                            available: string;
                                          }>;
                                        }>('GET', `/api/v1/skus/${l.skuId}/alternatives`)
                                          .then((r) =>
                                            setAlternatives((prev) => ({
                                              ...prev,
                                              [l.skuId]: r.alternatives,
                                            })),
                                          )
                                          .catch(() =>
                                            setAlternatives((prev) => ({
                                              ...prev,
                                              [l.skuId]: [],
                                            })),
                                          );
                                      }}
                                    >
                                      Alternative?
                                    </button>
                                  )
                                ) : null}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {l.lineTotal}
                                {['DRAFT', 'CONFIRMED'].includes(o.status) &&
                                can('order.confirm') ? (
                                  <button
                                    className="btn btn-sm"
                                    style={{ marginLeft: 6, padding: '1px 8px' }}
                                    disabled={busy}
                                    onClick={() => {
                                      const next = window.prompt('Nova količina', l.quantity);
                                      if (next && Number(next) > 0) {
                                        void run(
                                          () =>
                                            api(
                                              'POST',
                                              `/api/v1/orders/${o.id}/lines/${l.id}/amend`,
                                              {
                                                quantity: Number(next),
                                              },
                                            ),
                                          'Linija izmijenjena.',
                                        );
                                      }
                                    }}
                                    type="button"
                                  >
                                    Izmijeni
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}

                    <div className="row" style={{ marginTop: 8 }}>
                      {o.status === 'DRAFT' && can('order.create') ? (
                        <>
                          <select
                            className="select"
                            style={{ maxWidth: 140 }}
                            value={lineOrder === o.id ? lineSku : ''}
                            onChange={(e) => {
                              setLineOrder(o.id);
                              setLineSku(e.target.value);
                            }}
                          >
                            <option value="">SKU…</option>
                            {skus.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input"
                            style={{ maxWidth: 70 }}
                            type="number"
                            min="1"
                            step="any"
                            title="Količina"
                            value={lineOrder === o.id ? lineQty : '1'}
                            onChange={(e) => {
                              setLineOrder(o.id);
                              setLineQty(e.target.value);
                            }}
                          />
                          <input
                            className="input"
                            style={{ maxWidth: 90 }}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Cijena"
                            value={lineOrder === o.id ? linePrice : ''}
                            onChange={(e) => {
                              setLineOrder(o.id);
                              setLinePrice(e.target.value);
                            }}
                          />
                          <button
                            className="btn btn-sm"
                            disabled={busy || lineOrder !== o.id || !lineSku || linePrice === ''}
                            onClick={() =>
                              run(
                                () =>
                                  api('POST', `/api/v1/orders/${o.id}/lines`, {
                                    skuId: lineSku,
                                    quantity: Number(lineQty),
                                    unitPrice: Number(linePrice),
                                  }),
                                null,
                              )
                            }
                            type="button"
                          >
                            Dodaj liniju
                          </button>
                          {o.lines.length > 0 ? (
                            <>
                              <input
                                className="input"
                                style={{ maxWidth: 120 }}
                                placeholder="Promo kod"
                                value={promoOrder === o.id ? promoCode : ''}
                                onChange={(e) => {
                                  setPromoOrder(o.id);
                                  setPromoCode(e.target.value.toUpperCase());
                                }}
                              />
                              <button
                                className="btn btn-sm"
                                disabled={busy || promoOrder !== o.id || !promoCode}
                                onClick={() =>
                                  run(
                                    () =>
                                      api('POST', `/api/v1/orders/${o.id}/apply-promotion`, {
                                        code: promoCode,
                                      }),
                                    'Promocija primijenjena.',
                                  )
                                }
                                type="button"
                              >
                                Primijeni promo
                              </button>
                            </>
                          ) : null}
                          {o.lines.length > 0 && can('order.confirm') ? (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/orders/${o.id}/confirm`),
                                  'Narudžba potvrđena — zalihe rezervisane.',
                                )
                              }
                              type="button"
                            >
                              Potvrdi
                            </button>
                          ) : null}
                          {o.lines.length > 0 && can('order.confirm') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              title="Potvrdi i kada nema dovoljno zaliha — nedostajuće linije postaju zaostaci (backorder)"
                              onClick={() =>
                                run(
                                  () =>
                                    api('POST', `/api/v1/orders/${o.id}/confirm`, {
                                      allowBackorder: true,
                                    }),
                                  'Narudžba potvrđena — nedostajuće zalihe evidentirane kao zaostaci.',
                                )
                              }
                              type="button"
                            >
                              Potvrdi + zaostatak
                            </button>
                          ) : null}
                        </>
                      ) : null}

                      {o.status === 'CONFIRMED' ? (
                        <>
                          {can('order.confirm') ? (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              title="Fulfilment: stvarni izlaz robe — knjiži izlaz zaliha iz ledgera"
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/orders/${o.id}/fulfill`),
                                  'Narudžba ispunjena — izlaz zaliha knjižen u ledgeru.',
                                )
                              }
                              type="button"
                            >
                              Ispuni (fulfilment)
                            </button>
                          ) : null}
                          {o.fulfillmentType === 'PICKUP' && can('order.confirm') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/orders/${o.id}/ready-for-pickup`),
                                  'Narudžba označena kao spremna za preuzimanje.',
                                )
                              }
                              type="button"
                            >
                              Spremno za preuzimanje
                            </button>
                          ) : null}
                          {can('inventory.adjust') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              title="Kreira paket (pošiljku) za linije — ne knjiži izlaz robe"
                              onClick={() =>
                                run(
                                  () =>
                                    api('POST', '/api/v1/packages', {
                                      orderId: o.id,
                                      lines: o.lines.map((l) => ({
                                        orderLineId: l.id,
                                        quantity: Number(l.quantity),
                                      })),
                                    }),
                                  'Paket kreiran.',
                                )
                              }
                              type="button"
                            >
                              Zapakuj
                            </button>
                          ) : null}
                          {o.lines.some((l) => l.backordered) && can('order.confirm') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/orders/${o.id}/release-backorders`),
                                  'Pokušano oslobađanje zaostataka — rezervisano koliko zalihe dozvoljavaju.',
                                )
                              }
                              type="button"
                            >
                              Oslobodi zaostatke
                            </button>
                          ) : null}
                          {can('order.hold') ? (
                            <>
                              <input
                                className="input"
                                style={{ maxWidth: 160 }}
                                placeholder="Razlog čekanja…"
                                value={holdOrder === o.id ? holdReason : ''}
                                onChange={(e) => {
                                  setHoldOrder(o.id);
                                  setHoldReason(e.target.value);
                                }}
                              />
                              <button
                                className="btn btn-sm"
                                disabled={busy || holdOrder !== o.id || !holdReason.trim()}
                                onClick={() =>
                                  run(
                                    () =>
                                      api('POST', `/api/v1/orders/${o.id}/hold`, {
                                        reason: holdReason,
                                      }),
                                    'Narudžba stavljena na čekanje.',
                                  )
                                }
                                type="button"
                              >
                                Na čekanje
                              </button>
                            </>
                          ) : null}
                        </>
                      ) : null}

                      {o.status === 'ON_HOLD' && can('order.hold') ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/orders/${o.id}/release`),
                              'Čekanje uklonjeno.',
                            )
                          }
                          type="button"
                        >
                          Skini s čekanja
                        </button>
                      ) : null}

                      {['DRAFT', 'CONFIRMED', 'ON_HOLD'].includes(o.status) &&
                      can('order.cancel') ? (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/orders/${o.id}/cancel`),
                              'Narudžba otkazana — rezervacije oslobođene.',
                            )
                          }
                          type="button"
                        >
                          Otkaži
                        </button>
                      ) : null}

                      {o.status === 'FULFILLED' ? (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            downloadDocument(`/api/v1/documents/delivery-note/${o.id}/pdf`).catch(
                              (e: unknown) => setError(errorText(e)),
                            );
                          }}
                          type="button"
                        >
                          Otpremnica (PDF)
                        </button>
                      ) : null}
                      {o.status === 'FULFILLED' && can('order.return') ? (
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Razlog povrata (RMA)');
                            if (!reason) return;
                            void run(
                              () =>
                                api('POST', '/api/v1/returns', {
                                  orderId: o.id,
                                  reason,
                                  lines: o.lines.map((l) => ({
                                    orderLineId: l.id,
                                    quantity: Number(l.quantity),
                                  })),
                                }),
                              'Povrat zatražen (RMA kreirana).',
                            );
                          }}
                          type="button"
                        >
                          Zatraži povrat
                        </button>
                      ) : null}
                      <button
                        className="btn btn-sm"
                        onClick={() => toggleTimeline(o.id)}
                        type="button"
                      >
                        {timeline[o.id] ? 'Sakrij historiju' : 'Historija'}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => setDiscussion((d) => ({ ...d, [o.id]: !d[o.id] }))}
                        type="button"
                      >
                        {discussion[o.id] ? 'Sakrij diskusiju' : 'Diskusija'}
                      </button>
                    </div>

                    {timeline[o.id] ? (
                      <div style={{ marginTop: 8 }}>
                        {timeline[o.id]!.length === 0 ? (
                          <EmptyState text="Nema događaja u historiji." />
                        ) : null}
                        {timeline[o.id]!.map((ev) => (
                          <div
                            key={ev.id}
                            className="muted"
                            style={{ fontSize: 12, padding: '2px 0' }}
                          >
                            <span className="mono">{new Date(ev.createdAt).toLocaleString()}</span>{' '}
                            — {ev.eventType}
                            {ev.note ? ` (${ev.note})` : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="row" style={{ marginTop: 6 }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => {
                          api<{
                            totalWeightKg: string;
                            totalVolumeM3: string;
                            linesMissingData: number;
                          }>('GET', `/api/v1/orders/${o.id}/logistics`)
                            .then((r) => setLogistics((prev) => ({ ...prev, [o.id]: r })))
                            .catch(() => undefined);
                        }}
                      >
                        Logistika
                      </button>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => {
                          api<{
                            orderPromise: string;
                            lines: Array<{ fromStock: boolean }>;
                          }>('GET', `/api/v1/orders/${o.id}/promise`)
                            .then((r) =>
                              setPromises((prev) => ({
                                ...prev,
                                [o.id]: {
                                  orderPromise: r.orderPromise,
                                  fromStockCount: r.lines.filter((l) => l.fromStock).length,
                                  total: r.lines.length,
                                },
                              })),
                            )
                            .catch(() => undefined);
                        }}
                      >
                        Datum obećanja
                      </button>
                      {can('order.create') ? (
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={busy}
                          title="Kreiraj novi nacrt s istim linijama"
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/orders/${o.id}/repeat`),
                              'Narudžba ponovljena.',
                            )
                          }
                        >
                          Ponovi
                        </button>
                      ) : null}
                      {promises[o.id] ? (
                        <span className="muted mono" style={{ fontSize: 12 }}>
                          ≈ {new Date(promises[o.id]!.orderPromise).toLocaleDateString()} ·{' '}
                          {promises[o.id]!.fromStockCount}/{promises[o.id]!.total} sa zaliha
                        </span>
                      ) : null}
                      {logistics[o.id] ? (
                        <span className="muted mono" style={{ fontSize: 12 }}>
                          {logistics[o.id]!.totalWeightKg} kg · {logistics[o.id]!.totalVolumeM3} m³
                          {logistics[o.id]!.linesMissingData > 0
                            ? ` · ${logistics[o.id]!.linesMissingData} linija bez podataka`
                            : ''}
                        </span>
                      ) : null}
                    </div>
                    {discussion[o.id] ? (
                      <CollabPanel entityType="sales_order" entityId={o.id} />
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}

          <div className="card" style={{ marginTop: 12 }}>
            <h2>Povrati (RMA)</h2>
            {returns.length === 0 ? <EmptyState text="Nema povrata." /> : null}
            {returns.map((r) => (
              <div
                key={r.id}
                className="spread"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}
              >
                <div>
                  <strong className="mono">{r.rmaNumber}</strong>{' '}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {r.reason}
                  </span>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.lines.map((l) => `${l.description} ×${l.quantity}`).join(', ')}
                  </div>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <span
                    className={`badge ${
                      r.status === 'CLOSED'
                        ? 'badge-ok'
                        : r.status === 'REJECTED'
                          ? 'badge-danger'
                          : 'badge-warn'
                    }`}
                  >
                    {RETURN_STATUS_LABELS[r.status]}
                  </span>
                  {r.status === 'REQUESTED' && can('order.return') ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/returns/${r.id}/decide`, { approve: true }),
                            'Povrat odobren.',
                          )
                        }
                        type="button"
                      >
                        Odobri
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/returns/${r.id}/decide`, { approve: false }),
                            'Povrat odbijen.',
                          )
                        }
                        type="button"
                      >
                        Odbij
                      </button>
                    </>
                  ) : null}
                  {r.status === 'APPROVED' && can('order.return') ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/returns/${r.id}/receive`),
                          'Roba zaprimljena nazad na zalihe.',
                        )
                      }
                      type="button"
                    >
                      Zaprimi robu
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {can('order.create') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Brza narudžba (komercijalista)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Jedna linija po artiklu: <span className="mono">SKU-KOD količina</span>. Nepoznati
            kodovi se prijavljuju, cijene su podrazumijevano 0 radi naknadnog obračuna.
          </p>
          <form
            className="row"
            style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}
            onSubmit={(e) => {
              e.preventDefault();
              const lines = quickText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                  const [code, qty] = l.split(/\s+/);
                  return { code: code ?? '', quantity: Number(qty ?? '1') || 1 };
                });
              void run(async () => {
                const r = await api<{ unknownCodes: string[] }>('POST', '/api/v1/orders/quick', {
                  accountId: quickAccount,
                  warehouseId: quickWarehouse,
                  currency: 'EUR',
                  lines,
                });
                setQuickText('');
                if (r.unknownCodes.length > 0) {
                  setNotice(
                    `Narudžba kreirana — nepoznati kodovi preskočeni: ${r.unknownCodes.join(', ')}`,
                  );
                }
              }, 'Brza narudžba kreirana (nacrt).');
            }}
          >
            <textarea
              className="input mono"
              style={{ minWidth: 260, minHeight: 90 }}
              placeholder={'PRO-001 5\nPRO-002 2'}
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              required
            />
            <select
              className="select"
              style={{ maxWidth: 180 }}
              value={quickAccount}
              onChange={(e) => setQuickAccount(e.target.value)}
              required
            >
              <option value="">Kupac…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ maxWidth: 180 }}
              value={quickWarehouse}
              onChange={(e) => setQuickWarehouse(e.target.value)}
              required
            >
              <option value="">Skladište…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
              Kreiraj nacrt
            </button>
          </form>
        </div>
      ) : null}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Paketi</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          Pripremi/Otpremi mijenja samo status pošiljke (paketa) — to nije izlaz robe. Stvarni izlaz
          zaliha knjiži se fulfilmentom na narudžbi (dugme &bdquo;Ispuni&ldquo;).
        </p>
        {packages.length === 0 ? <EmptyState text="Nema paketa." /> : null}
        {packages.slice(0, 10).map((p) => (
          <div key={p.id} className="row spread" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>
              <strong className="mono">{p.packageNumber}</strong>{' '}
              <span className="muted mono">{p.orderNumber}</span>{' '}
              <span
                className={`badge ${
                  p.status === 'SHIPPED'
                    ? 'badge-ok'
                    : p.status === 'STAGED'
                      ? 'badge-accent'
                      : 'badge-warn'
                }`}
              >
                {PACKAGE_STATUS_LABELS[p.status] ?? p.status}
              </span>
            </span>
            <span>
              {can('inventory.adjust') && p.status === 'PACKED' ? (
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  title="Mijenja samo status pošiljke na pripremljeno (STAGED) — ne knjiži izlaz robe"
                  onClick={() =>
                    run(
                      () => api('POST', `/api/v1/packages/${p.id}/stage`),
                      'Paket pripremljen (status pošiljke).',
                    )
                  }
                  type="button"
                >
                  Pripremi
                </button>
              ) : null}
              {can('inventory.adjust') && p.status === 'STAGED' ? (
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  title="Mijenja samo status pošiljke na otpremljeno (SHIPPED) — izlaz robe knjiži fulfilment narudžbe"
                  onClick={() =>
                    run(
                      () => api('POST', `/api/v1/packages/${p.id}/ship`),
                      'Paket otpremljen (status pošiljke).',
                    )
                  }
                  type="button"
                >
                  Otpremi
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
