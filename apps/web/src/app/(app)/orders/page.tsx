'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import { CollabPanel } from '../collab-panel';
import { downloadDocument } from '../../../lib/download';

interface OrderLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  reservationId: string | null;
  backordered: boolean;
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
  const [alternatives, setAlternatives] = useState<
    Record<string, Array<{ substituteCode: string; available: string }>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newAccount, setNewAccount] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newCurrency, setNewCurrency] = useState('EUR');
  const [fromQuote, setFromQuote] = useState('');
  const [fromQuoteWarehouse, setFromQuoteWarehouse] = useState('');

  const [lineOrder, setLineOrder] = useState('');
  const [lineSku, setLineSku] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('');
  const [holdOrder, setHoldOrder] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [timeline, setTimeline] = useState<Record<string, OrderEventView[]>>({});
  const [discussion, setDiscussion] = useState<Record<string, boolean>>({});
  const [returns, setReturns] = useState<ReturnView[]>([]);

  const load = useCallback(() => {
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

  return (
    <main className="page">
      <h1>Orders</h1>
      <p className="page-sub">
        Canonical sales orders — confirmation reserves warehouse stock; fulfillment issues it from
        the ledger; cancellation releases it back.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

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
                      }),
                    'Order created (draft).',
                  );
                }}
              >
                <h2>New order</h2>
                <label className="label">Account</label>
                <select
                  className="select"
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  required
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber} — {a.partyName}
                    </option>
                  ))}
                </select>
                <label className="label">Warehouse</label>
                <select
                  className="select"
                  value={newWarehouse}
                  onChange={(e) => setNewWarehouse(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
                <label className="label">Currency</label>
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
                  Create order
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
                      'Order created from the accepted quote.',
                    );
                  }}
                >
                  <h2>From accepted quote</h2>
                  <label className="label">Quote</label>
                  <select
                    className="select"
                    value={fromQuote}
                    onChange={(e) => setFromQuote(e.target.value)}
                    required
                  >
                    <option value="">Select quote…</option>
                    {quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quoteNumber} — {q.total} {q.currency}
                      </option>
                    ))}
                  </select>
                  <label className="label">Fulfil from warehouse</label>
                  <select
                    className="select"
                    value={fromQuoteWarehouse}
                    onChange={(e) => setFromQuoteWarehouse(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
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
                    Convert to order
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="card">
          <h2>Sales orders</h2>
          {orders === null ? <div className="loading">Loading orders…</div> : null}
          {orders && orders.length === 0 ? (
            <div className="empty">No orders yet — create one, or convert an accepted quote.</div>
          ) : null}
          {(orders ?? []).map((o) => (
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
                <div>
                  <strong className="mono">{o.orderNumber}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {accountName(o.accountId)} · {o.total} {o.currency}
                    {o.quoteId ? ' · from quote' : ''}
                  </div>
                </div>
                <span className={`badge ${ORDER_BADGE[o.status]}`}>{o.status}</span>
              </div>
              {o.status === 'ON_HOLD' && o.holdReason ? (
                <div className="alert alert-error" style={{ marginTop: 8 }}>
                  On hold: {o.holdReason}
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
                          {l.reservationId ? (
                            <span className="badge badge-accent" style={{ marginLeft: 6 }}>
                              reserved
                            </span>
                          ) : null}
                          {l.backordered ? (
                            <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                              backorder
                            </span>
                          ) : null}
                          {l.backordered ? (
                            alternatives[l.skuId] ? (
                              alternatives[l.skuId]!.length > 0 ? (
                                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                                  Alt:{' '}
                                  {alternatives[l.skuId]!.map(
                                    (a) => `${a.substituteCode} (${a.available})`,
                                  ).join(', ')}
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
                                      setAlternatives((prev) => ({ ...prev, [l.skuId]: [] })),
                                    );
                                }}
                              >
                                Alternatives?
                              </button>
                            )
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {l.lineTotal}
                          {['DRAFT', 'CONFIRMED'].includes(o.status) && can('order.confirm') ? (
                            <button
                              className="btn btn-sm"
                              style={{ marginLeft: 6, padding: '1px 8px' }}
                              disabled={busy}
                              onClick={() => {
                                const next = window.prompt('New quantity', l.quantity);
                                if (next && Number(next) > 0) {
                                  void run(
                                    () =>
                                      api('POST', `/api/v1/orders/${o.id}/lines/${l.id}/amend`, {
                                        quantity: Number(next),
                                      }),
                                    'Line amended.',
                                  );
                                }
                              }}
                              type="button"
                            >
                              Amend
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
                      title="Quantity"
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
                      placeholder="Price"
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
                      Add line
                    </button>
                    {o.lines.length > 0 && can('order.confirm') ? (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/orders/${o.id}/confirm`),
                            'Order confirmed — stock reserved.',
                          )
                        }
                        type="button"
                      >
                        Confirm
                      </button>
                    ) : null}
                    {o.lines.length > 0 && can('order.confirm') ? (
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        title="Confirm even when stock is missing — short lines become backorders"
                        onClick={() =>
                          run(
                            () =>
                              api('POST', `/api/v1/orders/${o.id}/confirm`, {
                                allowBackorder: true,
                              }),
                            'Order confirmed — missing stock recorded as backorders.',
                          )
                        }
                        type="button"
                      >
                        Confirm + backorder
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
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/orders/${o.id}/fulfill`),
                            'Order fulfilled — stock issued from the ledger.',
                          )
                        }
                        type="button"
                      >
                        Fulfill
                      </button>
                    ) : null}
                    {o.lines.some((l) => l.backordered) && can('order.confirm') ? (
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/orders/${o.id}/release-backorders`),
                            'Backorder release attempted — reserved what stock allows.',
                          )
                        }
                        type="button"
                      >
                        Release backorders
                      </button>
                    ) : null}
                    {can('order.hold') ? (
                      <>
                        <input
                          className="input"
                          style={{ maxWidth: 160 }}
                          placeholder="Hold reason…"
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
                              'Order placed on hold.',
                            )
                          }
                          type="button"
                        >
                          Hold
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
                      run(() => api('POST', `/api/v1/orders/${o.id}/release`), 'Hold released.')
                    }
                    type="button"
                  >
                    Release hold
                  </button>
                ) : null}

                {['DRAFT', 'CONFIRMED', 'ON_HOLD'].includes(o.status) && can('order.cancel') ? (
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api('POST', `/api/v1/orders/${o.id}/cancel`),
                        'Order cancelled — reservations released.',
                      )
                    }
                    type="button"
                  >
                    Cancel
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
                    Delivery note PDF
                  </button>
                ) : null}
                {o.status === 'FULFILLED' && can('order.return') ? (
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt('Return reason (RMA)');
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
                        'Return requested (RMA created).',
                      );
                    }}
                    type="button"
                  >
                    Request return
                  </button>
                ) : null}
                <button className="btn btn-sm" onClick={() => toggleTimeline(o.id)} type="button">
                  {timeline[o.id] ? 'Hide history' : 'History'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setDiscussion((d) => ({ ...d, [o.id]: !d[o.id] }))}
                  type="button"
                >
                  {discussion[o.id] ? 'Hide discussion' : 'Discussion'}
                </button>
              </div>

              {timeline[o.id] ? (
                <div style={{ marginTop: 8 }}>
                  {timeline[o.id]!.map((ev) => (
                    <div key={ev.id} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                      <span className="mono">{new Date(ev.createdAt).toLocaleString()}</span> —{' '}
                      {ev.eventType}
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
                  Logistics
                </button>
                {logistics[o.id] ? (
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {logistics[o.id]!.totalWeightKg} kg · {logistics[o.id]!.totalVolumeM3} m³
                    {logistics[o.id]!.linesMissingData > 0
                      ? ` · ${logistics[o.id]!.linesMissingData} lines w/o data`
                      : ''}
                  </span>
                ) : null}
              </div>
              {discussion[o.id] ? <CollabPanel entityType="sales_order" entityId={o.id} /> : null}
            </div>
          ))}

          {returns.length > 0 ? (
            <div className="card" style={{ marginTop: 12 }}>
              <h2>Returns (RMA)</h2>
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
                      {r.status}
                    </span>
                    {r.status === 'REQUESTED' && can('order.return') ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                api('POST', `/api/v1/returns/${r.id}/decide`, { approve: true }),
                              'Return approved.',
                            )
                          }
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                api('POST', `/api/v1/returns/${r.id}/decide`, { approve: false }),
                              'Return rejected.',
                            )
                          }
                          type="button"
                        >
                          Reject
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
                            'Goods received back into stock.',
                          )
                        }
                        type="button"
                      >
                        Receive goods
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
