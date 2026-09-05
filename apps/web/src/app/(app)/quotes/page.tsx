'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { downloadDocument } from '../../../lib/download';
import { useApp } from '../app-shell';

interface PriceListView {
  id: string;
  code: string;
  name: string;
  currency: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

interface QuoteLineView {
  id: string;
  description: string;
  quantity: string;
  listUnitPrice: string;
  discountPct: string;
  lineTotal: string;
}

interface QuoteView {
  id: string;
  quoteNumber: string;
  version: number;
  accountId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  currency: string;
  total: string;
  lines: QuoteLineView[];
}

interface AccountView {
  id: string;
  partyName: string;
  accountNumber: string;
}

interface SkuOption {
  id: string;
  code: string;
}

const QUOTE_BADGE: Record<QuoteView['status'], string> = {
  DRAFT: 'badge-warn',
  PENDING_APPROVAL: 'badge-warn',
  APPROVED: 'badge-accent',
  SENT: 'badge-accent',
  ACCEPTED: 'badge-ok',
  REJECTED: 'badge-danger',
  EXPIRED: '',
};

function num(v: string): number {
  return Number(v);
}

export default function QuotesPage() {
  const { can } = useApp();
  const [priceLists, setPriceLists] = useState<PriceListView[]>([]);
  const [quotes, setQuotes] = useState<QuoteView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [plCode, setPlCode] = useState('');
  const [plName, setPlName] = useState('');
  const [plCurrency, setPlCurrency] = useState('EUR');
  const [priceSku, setPriceSku] = useState('');
  const [priceList, setPriceList] = useState('');
  const [priceValue, setPriceValue] = useState('');

  const [quoteAccount, setQuoteAccount] = useState('');
  const [quotePriceList, setQuotePriceList] = useState('');
  const [lineQuote, setLineQuote] = useState('');
  const [lineSku, setLineSku] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineDiscount, setLineDiscount] = useState('0');

  const load = useCallback(() => {
    if (can('pricing.read')) {
      api<{ priceLists: PriceListView[] }>('GET', '/api/v1/price-lists')
        .then((r) => setPriceLists(r.priceLists))
        .catch(() => setPriceLists([]));
    }
    api<{ quotes: QuoteView[] }>('GET', '/api/v1/quotes')
      .then((r) => {
        setQuotes(r.quotes);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ accounts: AccountView[] }>('GET', '/api/v1/crm/accounts')
      .then((r) => setAccounts(r.accounts))
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

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Quotes &amp; pricing</h1>
      <p className="page-sub">
        Price lists with quantity breaks; quotes with a margin floor — discounts above 20% go
        through approval.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          {can('pricing.read') ? (
            <div className="card">
              <h2>Price lists</h2>
              {priceLists.length === 0 ? (
                <div className="empty">No price lists yet.</div>
              ) : (
                <table className="table">
                  <tbody>
                    {priceLists.map((pl) => (
                      <tr key={pl.id}>
                        <td className="mono">{pl.code}</td>
                        <td>
                          {pl.name} <span className="muted">({pl.currency})</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${pl.status === 'ACTIVE' ? 'badge-ok' : 'badge-warn'}`}
                          >
                            {pl.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {pl.status === 'DRAFT' && can('pricing.manage') ? (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/price-lists/${pl.id}/publish`),
                                  'Price list published.',
                                )
                              }
                              type="button"
                            >
                              Publish
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {can('pricing.manage') ? (
                <>
                  <form
                    className="row"
                    style={{ marginTop: 12 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(
                        () =>
                          api('POST', '/api/v1/price-lists', {
                            code: plCode,
                            name: plName,
                            currency: plCurrency,
                          }),
                        'Price list created (draft).',
                      ).then(() => {
                        setPlCode('');
                        setPlName('');
                      });
                    }}
                  >
                    <input
                      className="input mono"
                      style={{ maxWidth: 110 }}
                      placeholder="Code"
                      value={plCode}
                      onChange={(e) => setPlCode(e.target.value)}
                      required
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 170 }}
                      placeholder="Name"
                      value={plName}
                      onChange={(e) => setPlName(e.target.value)}
                      required
                    />
                    <input
                      className="input mono"
                      style={{ maxWidth: 64 }}
                      value={plCurrency}
                      onChange={(e) => setPlCurrency(e.target.value)}
                      maxLength={3}
                      required
                    />
                    <button className="btn btn-sm" disabled={busy} type="submit">
                      Add list
                    </button>
                  </form>

                  <form
                    className="row"
                    style={{ marginTop: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(
                        () =>
                          api('PUT', `/api/v1/price-lists/${priceList}/entries`, {
                            skuId: priceSku,
                            unitPrice: Number(priceValue),
                          }),
                        'Price set.',
                      );
                    }}
                  >
                    <select
                      className="select"
                      style={{ maxWidth: 140 }}
                      value={priceList}
                      onChange={(e) => setPriceList(e.target.value)}
                      required
                    >
                      <option value="">List…</option>
                      {priceLists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.code}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      style={{ maxWidth: 170 }}
                      value={priceSku}
                      onChange={(e) => setPriceSku(e.target.value)}
                      required
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
                      style={{ maxWidth: 110 }}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      required
                    />
                    <button className="btn btn-sm" disabled={busy} type="submit">
                      Set price
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {can('quote.create') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/quotes', {
                      accountId: quoteAccount,
                      priceListId: quotePriceList,
                    }),
                  'Quote created (draft).',
                );
              }}
            >
              <h2>New quote</h2>
              <label className="label">Account</label>
              <select
                className="select"
                value={quoteAccount}
                onChange={(e) => setQuoteAccount(e.target.value)}
                required
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} — {a.partyName}
                  </option>
                ))}
              </select>
              <label className="label">Price list (active)</label>
              <select
                className="select"
                value={quotePriceList}
                onChange={(e) => setQuotePriceList(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {priceLists
                  .filter((pl) => pl.status === 'ACTIVE')
                  .map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.code} ({pl.currency})
                    </option>
                  ))}
              </select>
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Create quote
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Quotes</h2>
          {quotes === null ? <div className="loading">Loading quotes…</div> : null}
          {quotes && quotes.length === 0 ? (
            <div className="empty">
              No quotes yet — create one from an account and a price list.
            </div>
          ) : null}
          {(quotes ?? []).map((q) => (
            <div
              key={q.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <div>
                  <strong className="mono">
                    {q.quoteNumber}
                    {q.version > 1 ? ` v${q.version}` : ''}
                  </strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {accountName(q.accountId)} · {q.total} {q.currency}
                  </div>
                </div>
                <span>
                  <button
                    className="btn btn-sm"
                    style={{ marginRight: 6 }}
                    onClick={() => {
                      downloadDocument(`/api/v1/documents/quote/${q.id}/pdf`).catch((e: unknown) =>
                        setError(errorText(e)),
                      );
                    }}
                    type="button"
                  >
                    PDF
                  </button>
                  <span className={`badge ${QUOTE_BADGE[q.status]}`}>{q.status}</span>
                </span>
              </div>

              {q.lines.length > 0 ? (
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {q.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.description}</td>
                        <td>
                          {l.quantity} × {l.listUnitPrice}
                          {num(l.discountPct) > 0 ? (
                            <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                              −{l.discountPct}%
                            </span>
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right' }}>{l.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {can('quote.create') ? (
                <div className="row" style={{ marginTop: 8 }}>
                  {q.status === 'DRAFT' ? (
                    <>
                      <select
                        className="select"
                        style={{ maxWidth: 150 }}
                        value={lineQuote === q.id ? lineSku : ''}
                        onChange={(e) => {
                          setLineQuote(q.id);
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
                        value={lineQuote === q.id ? lineQty : '1'}
                        onChange={(e) => {
                          setLineQuote(q.id);
                          setLineQty(e.target.value);
                        }}
                      />
                      <input
                        className="input"
                        style={{ maxWidth: 70 }}
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        title="Discount %"
                        value={lineQuote === q.id ? lineDiscount : '0'}
                        onChange={(e) => {
                          setLineQuote(q.id);
                          setLineDiscount(e.target.value);
                        }}
                      />
                      <button
                        className="btn btn-sm"
                        disabled={busy || lineQuote !== q.id || !lineSku}
                        onClick={() =>
                          run(
                            () =>
                              api('POST', `/api/v1/quotes/${q.id}/lines`, {
                                skuId: lineSku,
                                quantity: Number(lineQty),
                                discountPct: Number(lineDiscount),
                              }),
                            null,
                          )
                        }
                        type="button"
                      >
                        Add line
                      </button>
                      {q.lines.length > 0 ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/quotes/${q.id}/submit`),
                              'Quote submitted.',
                            )
                          }
                          type="button"
                        >
                          Submit
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {q.status === 'PENDING_APPROVAL' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/quotes/${q.id}/sync-approval`), null)
                      }
                      type="button"
                    >
                      Check approval
                    </button>
                  ) : null}
                  {q.status === 'APPROVED' ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/quotes/${q.id}/send`), 'Quote sent.')
                      }
                      type="button"
                    >
                      Send to customer
                    </button>
                  ) : null}
                  {q.status === 'SENT' ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('POST', `/api/v1/quotes/${q.id}/accept`),
                            'Quote accepted 🎉',
                          )
                        }
                        type="button"
                      >
                        Mark accepted
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() =>
                          run(() => api('POST', `/api/v1/quotes/${q.id}/reject`), null)
                        }
                        type="button"
                      >
                        Mark rejected
                      </button>
                    </>
                  ) : null}
                  {['SENT', 'REJECTED', 'EXPIRED'].includes(q.status) ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/quotes/${q.id}/new-version`),
                          'New draft version created.',
                        )
                      }
                      type="button"
                    >
                      New version
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
