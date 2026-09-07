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

interface PromotionView {
  id: string;
  code: string;
  name: string;
  discountPct: string;
  redemptions: number;
  maxRedemptions: number | null;
  active: boolean;
}

interface DiscountRuleView {
  id: string;
  name: string;
  active: boolean;
  accountId: string | null;
  skuId: string | null;
  minQty: string;
  percentage: string;
}

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
  const [costSuggestions, setCostSuggestions] = useState<
    Array<{ skuId: string; code: string; standardCost: string; suggested: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rules, setRules] = useState<DiscountRuleView[]>([]);
  const [promos, setPromos] = useState<PromotionView[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [promoName, setPromoName] = useState('');
  const [promoPct, setPromoPct] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [rulePct, setRulePct] = useState('');
  const [ruleAccount, setRuleAccount] = useState('');
  const [ruleSku, setRuleSku] = useState('');
  const [plCode, setPlCode] = useState('');
  const [plAccount, setPlAccount] = useState('');
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
  const [lineDiscount, setLineDiscount] = useState('');

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
    api<{ rules: DiscountRuleView[] }>('GET', '/api/v1/discount-rules')
      .then((r) => setRules(r.rules))
      .catch(() => setRules([]));
    api<{ promotions: PromotionView[] }>('GET', '/api/v1/promotions')
      .then((r) => setPromos(r.promotions))
      .catch(() => setPromos([]));
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

              <button
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                type="button"
                onClick={() => {
                  if (showSuggestions) {
                    setShowSuggestions(false);
                    return;
                  }
                  api<{ suggestions: typeof costSuggestions }>(
                    'GET',
                    '/api/v1/price-lists/cost-suggestions?marginPct=30',
                  )
                    .then((r) => {
                      setCostSuggestions(r.suggestions);
                      setShowSuggestions(true);
                    })
                    .catch((e: unknown) => setError(errorText(e)));
                }}
              >
                Cost suggestions
              </button>
              {showSuggestions ? (
                costSuggestions.length === 0 ? (
                  <div className="empty">No SKUs with a standard cost yet.</div>
                ) : (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {costSuggestions.slice(0, 12).map((c) => (
                        <tr key={c.skuId}>
                          <td className="mono">{c.code}</td>
                          <td className="muted">cost {c.standardCost}</td>
                          <td>
                            <strong>{c.suggested}</strong>{' '}
                            <span className="muted" style={{ fontSize: 12 }}>
                              @30%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : null}

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
                            ...(plAccount ? { accountId: plAccount } : {}),
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
                    <select
                      className="select"
                      style={{ maxWidth: 170 }}
                      value={plAccount}
                      onChange={(e) => setPlAccount(e.target.value)}
                      title="Customer contract (optional)"
                    >
                      <option value="">General list</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          Contract: {a.accountNumber}
                        </option>
                      ))}
                    </select>
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

          {can('pricing.read') ? (
            <div className="card">
              <h2>Discount rules</h2>
              <p className="muted">
                Automatic discounts — the best matching rule applies when a quote line has no
                explicit discount.
              </p>
              {rules.length === 0 ? <div className="empty">No rules yet.</div> : null}
              {rules.map((r) => (
                <div key={r.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{r.name}</strong>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.percentage}% · min {r.minQty}
                      {r.accountId ? ' · account' : ''}
                      {r.skuId ? ' · SKU' : ''}
                    </span>
                  </span>
                  {can('pricing.manage') ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api('PUT', `/api/v1/discount-rules/${r.id}/active`, {
                              active: !r.active,
                            }),
                          r.active ? 'Rule deactivated.' : 'Rule activated.',
                        )
                      }
                      type="button"
                    >
                      {r.active ? 'Deactivate' : 'Activate'}
                    </button>
                  ) : (
                    <span className={`badge ${r.active ? 'badge-ok' : ''}`}>
                      {r.active ? 'active' : 'inactive'}
                    </span>
                  )}
                </div>
              ))}
              {can('pricing.manage') ? (
                <form
                  className="row"
                  style={{ marginTop: 10, flexWrap: 'wrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api('POST', '/api/v1/discount-rules', {
                          name: ruleName,
                          percentage: Number(rulePct),
                          ...(ruleAccount ? { accountId: ruleAccount } : {}),
                          ...(ruleSku ? { skuId: ruleSku } : {}),
                        }),
                      'Discount rule created.',
                    );
                  }}
                >
                  <input
                    className="input"
                    style={{ maxWidth: 150 }}
                    placeholder="Name"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 70 }}
                    type="number"
                    min="0.01"
                    max="100"
                    step="any"
                    placeholder="%"
                    value={rulePct}
                    onChange={(e) => setRulePct(e.target.value)}
                    required
                  />
                  <select
                    className="select"
                    style={{ maxWidth: 160 }}
                    value={ruleAccount}
                    onChange={(e) => setRuleAccount(e.target.value)}
                  >
                    <option value="">Every customer</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountNumber}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    style={{ maxWidth: 140 }}
                    value={ruleSku}
                    onChange={(e) => setRuleSku(e.target.value)}
                  >
                    <option value="">Every SKU</option>
                    {skus.map((sk) => (
                      <option key={sk.id} value={sk.id}>
                        {sk.code}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                    Add rule
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {can('pricing.read') ? (
            <div className="card">
              <h2>Promotions</h2>
              <p className="muted">
                Voucher codes redeemable on draft orders — percentage off the order total.
              </p>
              {promos.length === 0 ? <div className="empty">No promotions yet.</div> : null}
              {promos.map((pr) => (
                <div key={pr.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{pr.code}</strong>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {pr.name} · {pr.discountPct}% · {pr.redemptions}
                      {pr.maxRedemptions !== null ? `/${pr.maxRedemptions}` : ''} used
                    </span>
                  </span>
                  {can('pricing.manage') ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api('PUT', `/api/v1/promotions/${pr.id}/active`, {
                              active: !pr.active,
                            }),
                          pr.active ? 'Promotion deactivated.' : 'Promotion activated.',
                        )
                      }
                      type="button"
                    >
                      {pr.active ? 'Deactivate' : 'Activate'}
                    </button>
                  ) : (
                    <span className={`badge ${pr.active ? 'badge-ok' : ''}`}>
                      {pr.active ? 'active' : 'inactive'}
                    </span>
                  )}
                </div>
              ))}
              {can('pricing.manage') ? (
                <form
                  className="row"
                  style={{ marginTop: 10, flexWrap: 'wrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api('POST', '/api/v1/promotions', {
                          code: promoCode,
                          name: promoName,
                          discountPct: Number(promoPct),
                        }),
                      'Promotion created.',
                    );
                  }}
                >
                  <input
                    className="input"
                    style={{ maxWidth: 130 }}
                    placeholder="CODE"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 170 }}
                    placeholder="Name"
                    value={promoName}
                    onChange={(e) => setPromoName(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 70 }}
                    type="number"
                    min="0.01"
                    max="100"
                    step="any"
                    placeholder="%"
                    value={promoPct}
                    onChange={(e) => setPromoPct(e.target.value)}
                    required
                  />
                  <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                    Add promotion
                  </button>
                </form>
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
                onChange={(e) => {
                  const accountId = e.target.value;
                  setQuoteAccount(accountId);
                  if (accountId) {
                    api<{ contract: { id: string } | null }>(
                      'GET',
                      `/api/v1/price-lists/contract/${accountId}`,
                    )
                      .then((r) => {
                        if (r.contract) setQuotePriceList(r.contract.id);
                      })
                      .catch(() => undefined);
                  }
                }}
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
                        title="Discount % (empty = automatic rules)"
                        placeholder="auto"
                        value={lineQuote === q.id ? lineDiscount : ''}
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
                                // Empty = let discount rules decide; a number overrides.
                                ...(lineQuote === q.id && lineDiscount.trim() !== ''
                                  ? { discountPct: Number(lineDiscount) }
                                  : {}),
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
