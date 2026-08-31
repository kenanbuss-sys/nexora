'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface InvoiceView {
  id: string;
  invoiceNumber: string;
  invoiceType: 'CUSTOMER' | 'SUPPLIER';
  orderRefId: string;
  currency: string;
  total: string;
  paidAmount: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
}

interface MarginRow {
  orderId: string;
  orderNumber: string;
  revenue: string;
  cogs: string;
  margin: string;
  marginPct: string;
  currency: string;
}

interface PnlView {
  revenue: string;
  expenses: string;
  grossResult: string;
  cashIn: string;
  cashOut: string;
  openReceivables: string;
  openPayables: string;
}

interface OrderOption {
  id: string;
  orderNumber: string;
  status: string;
}

interface PoOption {
  id: string;
  poNumber: string;
  status: string;
}

const INVOICE_BADGE: Record<InvoiceView['status'], string> = {
  OPEN: 'badge-warn',
  PARTIALLY_PAID: 'badge-accent',
  PAID: 'badge-ok',
  VOID: '',
};

export default function FinancePage() {
  const { can } = useApp();
  const [invoices, setInvoices] = useState<InvoiceView[] | null>(null);
  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [pnl, setPnl] = useState<PnlView | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [pos, setPos] = useState<PoOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [invoiceOrder, setInvoiceOrder] = useState('');
  const [invoicePo, setInvoicePo] = useState('');
  const [payInvoice, setPayInvoice] = useState('');
  const [payAmount, setPayAmount] = useState('');

  const load = useCallback(() => {
    api<{ invoices: InvoiceView[] }>('GET', '/api/v1/finance/invoices')
      .then((r) => {
        setInvoices(r.invoices);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ rows: MarginRow[] }>('GET', '/api/v1/finance/margin')
      .then((r) => setMargin(r.rows))
      .catch(() => setMargin([]));
    api<PnlView>('GET', '/api/v1/finance/pnl')
      .then(setPnl)
      .catch(() => setPnl(null));
    api<{ orders: OrderOption[] }>('GET', '/api/v1/orders?status=FULFILLED')
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
    api<{ purchaseOrders: PoOption[] }>('GET', '/api/v1/purchase-orders')
      .then((r) =>
        setPos(
          r.purchaseOrders.filter((p) => ['RECEIVED', 'PARTIALLY_RECEIVED'].includes(p.status)),
        ),
      )
      .catch(() => setPos([]));
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

  return (
    <main className="page">
      <h1>Finance</h1>
      <p className="page-sub">
        Receivables from fulfilled orders, payables from received purchase orders, matched payments
        and live margin — an operational P&amp;L, not a general ledger.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {pnl ? (
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="stat-label">Revenue</div>
            <div className="stat-value">{pnl.revenue}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              cash in {pnl.cashIn}
            </div>
          </div>
          <div className="card stat">
            <div className="stat-label">Expenses</div>
            <div className="stat-value">{pnl.expenses}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              cash out {pnl.cashOut}
            </div>
          </div>
          <div className="card stat">
            <div className="stat-label">Gross result</div>
            <div className="stat-value">{pnl.grossResult}</div>
          </div>
          <div className="card stat">
            <div className="stat-label">Open AR / AP</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {pnl.openReceivables} / {pnl.openPayables}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          {can('finance.invoice') ? (
            <div className="card">
              <h2>Issue invoices</h2>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/finance/invoices/customer', {
                        orderId: invoiceOrder,
                        dueInDays: 30,
                      }),
                    'Customer invoice issued (30 days).',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  value={invoiceOrder}
                  onChange={(e) => setInvoiceOrder(e.target.value)}
                  required
                >
                  <option value="">Fulfilled order…</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                  Invoice customer
                </button>
              </form>
              <form
                className="row"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/finance/invoices/supplier', {
                        poId: invoicePo,
                        dueInDays: 30,
                      }),
                    'Supplier invoice recorded.',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  value={invoicePo}
                  onChange={(e) => setInvoicePo(e.target.value)}
                  required
                >
                  <option value="">Received PO…</option>
                  {pos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.poNumber}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Record supplier invoice
                </button>
              </form>
            </div>
          ) : null}

          <div className="card">
            <h2>Margin by order</h2>
            {margin.length === 0 ? (
              <div className="empty">Invoice a fulfilled order to see margin.</div>
            ) : (
              <table className="table">
                <tbody>
                  {margin.map((m) => (
                    <tr key={m.orderId}>
                      <td className="mono">{m.orderNumber}</td>
                      <td>
                        {m.revenue} − {m.cogs} {m.currency}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{m.margin}</strong>{' '}
                        <span
                          className={`badge ${Number(m.marginPct) >= 0 ? 'badge-ok' : 'badge-danger'}`}
                        >
                          {m.marginPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Invoices</h2>
          {invoices === null ? <div className="loading">Loading…</div> : null}
          {invoices && invoices.length === 0 ? <div className="empty">No invoices yet.</div> : null}
          {(invoices ?? []).map((i) => (
            <div
              key={i.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <div>
                  <strong className="mono">{i.invoiceNumber}</strong>
                  <span
                    className={`badge ${i.invoiceType === 'CUSTOMER' ? 'badge-accent' : 'badge-warn'}`}
                    style={{ marginLeft: 8 }}
                  >
                    {i.invoiceType === 'CUSTOMER' ? 'AR' : 'AP'}
                  </span>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {i.paidAmount} / {i.total} {i.currency} paid
                  </div>
                </div>
                <span className={`badge ${INVOICE_BADGE[i.status]}`}>
                  {i.status.replace('_', ' ')}
                </span>
              </div>
              {['OPEN', 'PARTIALLY_PAID'].includes(i.status) && can('finance.pay') ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <input
                    className="input"
                    style={{ maxWidth: 120 }}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amount"
                    value={payInvoice === i.id ? payAmount : ''}
                    onChange={(e) => {
                      setPayInvoice(i.id);
                      setPayAmount(e.target.value);
                    }}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || payInvoice !== i.id || !payAmount}
                    onClick={() =>
                      run(
                        () =>
                          api('POST', `/api/v1/finance/invoices/${i.id}/payments`, {
                            amount: Number(payAmount),
                          }),
                        'Payment matched.',
                      ).then(() => setPayAmount(''))
                    }
                    type="button"
                  >
                    Record payment
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setPayInvoice(i.id);
                      setPayAmount((Number(i.total) - Number(i.paidAmount)).toFixed(2));
                    }}
                    type="button"
                  >
                    Pay in full
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
