'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../../../lib/api';
import { downloadDocument } from '../../../lib/download';
import { useApp } from '../app-shell';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

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

interface WarehouseView {
  id: string;
  code: string;
  name: string;
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

const QUOTE_STATUS_LABELS: Record<QuoteView['status'], string> = {
  DRAFT: 'Nacrt',
  PENDING_APPROVAL: 'Čeka odobrenje',
  APPROVED: 'Odobrena',
  SENT: 'Poslana',
  ACCEPTED: 'Prihvaćena',
  REJECTED: 'Odbijena',
  EXPIRED: 'Istekla',
};

const PRICE_LIST_STATUS_LABELS: Record<PriceListView['status'], string> = {
  DRAFT: 'Nacrt',
  ACTIVE: 'Aktivan',
  ARCHIVED: 'Arhiviran',
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

type ConfirmAction =
  | { type: 'send'; quote: QuoteView }
  | { type: 'accept'; quote: QuoteView }
  | { type: 'reject'; quote: QuoteView }
  | { type: 'convert'; quote: QuoteView };

function num(v: string): number {
  return Number(v);
}

export default function QuotesPage() {
  const { can } = useApp();
  const [priceLists, setPriceLists] = useState<PriceListView[]>([]);
  const [quotes, setQuotes] = useState<QuoteView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
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

  const [openQuote, setOpenQuote] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | QuoteView['status']>('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [convertWarehouse, setConvertWarehouse] = useState('');
  const [converted, setConverted] = useState<{ orderNumber: string } | null>(null);

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
    if (can('order.create')) {
      api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
        .then((r) => {
          setWarehouses(r.warehouses);
          const first = r.warehouses[0];
          if (first) setConvertWarehouse(first.id);
        })
        .catch(() => undefined);
    }
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

  /** Critical actions: the API call happens only here, from the dialog's confirm. */
  function runConfirmed(fn: () => Promise<unknown>, successText: string | null) {
    void run(fn, successText).finally(() => setConfirm(null));
  }

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  const quoteRows = (quotes ?? []).filter((q) => !statusFilter || q.status === statusFilter);
  const opened = openQuote ? (quotes ?? []).find((q) => q.id === openQuote) : undefined;

  const quoteColumns: Array<Column<QuoteView>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (q) => (
        <strong className="mono">
          {q.quoteNumber}
          {q.version > 1 ? ` v${q.version}` : ''}
        </strong>
      ),
      text: (q) => q.quoteNumber,
    },
    {
      key: 'account',
      header: 'Kupac',
      render: (q) => accountName(q.accountId),
      text: (q) => accountName(q.accountId),
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => (
        <span className={`badge ${QUOTE_BADGE[q.status]}`}>{QUOTE_STATUS_LABELS[q.status]}</span>
      ),
      text: (q) => QUOTE_STATUS_LABELS[q.status],
    },
    {
      key: 'total',
      header: 'Iznos',
      align: 'right',
      render: (q) => (
        <span className="mono">
          {q.total} {q.currency}
        </span>
      ),
      text: (q) => `${q.total} ${q.currency}`,
    },
  ];

  const confirmFacts = (q: QuoteView) => (
    <>
      <div className="fact">
        <span>Ponuda</span>
        <span className="mono">
          {q.quoteNumber}
          {q.version > 1 ? ` v${q.version}` : ''}
        </span>
      </div>
      <div className="fact">
        <span>Kupac</span>
        <span>{accountName(q.accountId)}</span>
      </div>
      <div className="fact">
        <span>Ukupno</span>
        <span className="mono">
          {q.total} {q.currency}
        </span>
      </div>
      <div className="fact">
        <span>Broj stavki</span>
        <span>{q.lines.length}</span>
      </div>
    </>
  );

  const convertWh = warehouses.find((w) => w.id === convertWarehouse);

  return (
    <main className="page">
      <h1>Ponude i cjenovnici</h1>
      <p className="page-sub">
        Cjenovnici s količinskim pragovima; ponude s donjom granicom marže — popusti iznad 20% idu
        kroz odobrenje. Cijene i iznose računa server; UI ih samo prikazuje.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {converted ? (
        <div className="alert alert-ok">
          Narudžba <strong className="mono">{converted.orderNumber}</strong> kreirana iz ponude.{' '}
          <Link href="/orders">Otvori narudžbe →</Link>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          {can('pricing.read') ? (
            <div className="card">
              <h2>Cjenovnici</h2>
              {priceLists.length === 0 ? (
                <EmptyState text="Još nema cjenovnika." />
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
                            {PRICE_LIST_STATUS_LABELS[pl.status]}
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
                                  'Cjenovnik objavljen.',
                                )
                              }
                              type="button"
                            >
                              Objavi
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
                Prijedlozi cijena iz troška
              </button>
              {showSuggestions ? (
                costSuggestions.length === 0 ? (
                  <EmptyState text="Još nema SKU artikala sa standardnim troškom." />
                ) : (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {costSuggestions.slice(0, 12).map((c) => (
                        <tr key={c.skuId}>
                          <td className="mono">{c.code}</td>
                          <td className="muted">trošak {c.standardCost}</td>
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
                        'Cjenovnik kreiran (nacrt).',
                      ).then(() => {
                        setPlCode('');
                        setPlName('');
                      });
                    }}
                  >
                    <input
                      className="input mono"
                      style={{ maxWidth: 110 }}
                      placeholder="Šifra"
                      value={plCode}
                      onChange={(e) => setPlCode(e.target.value)}
                      required
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 170 }}
                      placeholder="Naziv"
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
                      title="Ugovor s kupcem (opcionalno)"
                    >
                      <option value="">Opšti cjenovnik</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          Ugovor: {a.accountNumber}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm" disabled={busy} type="submit">
                      Dodaj cjenovnik
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
                        'Cijena postavljena.',
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
                      <option value="">Cjenovnik…</option>
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
                      placeholder="Cijena"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      required
                    />
                    <button className="btn btn-sm" disabled={busy} type="submit">
                      Postavi cijenu
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {can('pricing.read') ? (
            <div className="card">
              <h2>Pravila popusta</h2>
              <p className="muted">
                Automatski popusti — najbolje odgovarajuće pravilo se primjenjuje kada stavka ponude
                nema eksplicitan popust.
              </p>
              {rules.length === 0 ? <EmptyState text="Još nema pravila." /> : null}
              {rules.map((r) => (
                <div key={r.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{r.name}</strong>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.percentage}% · min. kol. {r.minQty}
                      {r.accountId ? ' · kupac' : ''}
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
                          r.active ? 'Pravilo deaktivirano.' : 'Pravilo aktivirano.',
                        )
                      }
                      type="button"
                    >
                      {r.active ? 'Deaktiviraj' : 'Aktiviraj'}
                    </button>
                  ) : (
                    <span className={`badge ${r.active ? 'badge-ok' : ''}`}>
                      {r.active ? 'aktivno' : 'neaktivno'}
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
                      'Pravilo popusta kreirano.',
                    );
                  }}
                >
                  <input
                    className="input"
                    style={{ maxWidth: 150 }}
                    placeholder="Naziv"
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
                    <option value="">Svi kupci</option>
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
                    <option value="">Svi SKU</option>
                    {skus.map((sk) => (
                      <option key={sk.id} value={sk.id}>
                        {sk.code}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                    Dodaj pravilo
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {can('pricing.read') ? (
            <div className="card">
              <h2>Promocije</h2>
              <p className="muted">
                Vaučer kodovi koji se iskorištavaju na nacrtima narudžbi — procenat popusta na
                ukupan iznos narudžbe.
              </p>
              {promos.length === 0 ? <EmptyState text="Još nema promocija." /> : null}
              {promos.map((pr) => (
                <div key={pr.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{pr.code}</strong>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {pr.name} · {pr.discountPct}% · iskorišteno {pr.redemptions}
                      {pr.maxRedemptions !== null ? `/${pr.maxRedemptions}` : ''}
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
                          pr.active ? 'Promocija deaktivirana.' : 'Promocija aktivirana.',
                        )
                      }
                      type="button"
                    >
                      {pr.active ? 'Deaktiviraj' : 'Aktiviraj'}
                    </button>
                  ) : (
                    <span className={`badge ${pr.active ? 'badge-ok' : ''}`}>
                      {pr.active ? 'aktivna' : 'neaktivna'}
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
                      'Promocija kreirana.',
                    );
                  }}
                >
                  <input
                    className="input"
                    style={{ maxWidth: 130 }}
                    placeholder="KOD"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    required
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 170 }}
                    placeholder="Naziv"
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
                    Dodaj promociju
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
                  'Ponuda kreirana (nacrt).',
                );
              }}
            >
              <h2>Nova ponuda</h2>
              <label className="label">Kupac</label>
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
                <option value="">Odaberite kupca…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} — {a.partyName}
                  </option>
                ))}
              </select>
              <label className="label">Cjenovnik (aktivan)</label>
              <select
                className="select"
                value={quotePriceList}
                onChange={(e) => setQuotePriceList(e.target.value)}
                required
              >
                <option value="">Odaberite…</option>
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
                Kreiraj ponudu
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Ponude</h2>
          {quotes === null && !error ? <LoadingState text="Učitavanje ponuda…" /> : null}
          {quotes !== null ? (
            <DataTable
              columns={quoteColumns}
              rows={quoteRows}
              rowKey={(q) => q.id}
              onRowClick={(q) => setOpenQuote((prev) => (prev === q.id ? null : q.id))}
              searchPlaceholder="Pretraga ponuda…"
              pageSize={10}
              emptyText={
                statusFilter
                  ? 'Nema ponuda za odabrani status.'
                  : 'Još nema ponuda — kreirajte novu iz kupca i cjenovnika.'
              }
              toolbar={
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as '' | QuoteView['status'])}
                  aria-label="Filter po statusu"
                >
                  <option value="">Svi statusi</option>
                  {(Object.keys(QUOTE_STATUS_LABELS) as Array<QuoteView['status']>).map((s) => (
                    <option key={s} value={s}>
                      {QUOTE_STATUS_LABELS[s]}
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
              <div className="spread">
                <div>
                  <strong className="mono">
                    {opened.quoteNumber}
                    {opened.version > 1 ? ` v${opened.version}` : ''}
                  </strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {accountName(opened.accountId)} · {opened.total} {opened.currency} ·{' '}
                    <Link href="/crm">Kupac u CRM-u →</Link>
                  </div>
                </div>
                <span>
                  <button
                    className="btn btn-sm"
                    style={{ marginRight: 6 }}
                    onClick={() => {
                      downloadDocument(`/api/v1/documents/quote/${opened.id}/pdf`).catch(
                        (e: unknown) => setError(errorText(e)),
                      );
                    }}
                    type="button"
                  >
                    PDF
                  </button>
                  <span className={`badge ${QUOTE_BADGE[opened.status]}`}>
                    {QUOTE_STATUS_LABELS[opened.status]}
                  </span>
                </span>
              </div>

              {opened.lines.length > 0 ? (
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Stavka</th>
                      <th style={{ textAlign: 'right' }}>Količina</th>
                      <th style={{ textAlign: 'right' }}>Cijena</th>
                      <th style={{ textAlign: 'right' }}>Popust</th>
                      <th style={{ textAlign: 'right' }}>Ukupno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opened.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.description}</td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {l.quantity}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {l.listUnitPrice} {opened.currency}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {num(l.discountPct) > 0 ? (
                            <span className="badge badge-warn">−{l.discountPct}%</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {l.lineTotal} {opened.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState text="Ponuda još nema stavki." />
              )}

              {can('quote.create') ? (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {opened.status === 'DRAFT' ? (
                    <>
                      <select
                        className="select"
                        style={{ maxWidth: 150 }}
                        value={lineQuote === opened.id ? lineSku : ''}
                        onChange={(e) => {
                          setLineQuote(opened.id);
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
                        value={lineQuote === opened.id ? lineQty : '1'}
                        onChange={(e) => {
                          setLineQuote(opened.id);
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
                        title="Popust % (prazno = automatska pravila)"
                        placeholder="auto"
                        value={lineQuote === opened.id ? lineDiscount : ''}
                        onChange={(e) => {
                          setLineQuote(opened.id);
                          setLineDiscount(e.target.value);
                        }}
                      />
                      <button
                        className="btn btn-sm"
                        disabled={busy || lineQuote !== opened.id || !lineSku}
                        onClick={() =>
                          run(
                            () =>
                              api('POST', `/api/v1/quotes/${opened.id}/lines`, {
                                skuId: lineSku,
                                quantity: Number(lineQty),
                                // Empty = let discount rules decide; a number overrides.
                                ...(lineQuote === opened.id && lineDiscount.trim() !== ''
                                  ? { discountPct: Number(lineDiscount) }
                                  : {}),
                              }),
                            null,
                          )
                        }
                        type="button"
                      >
                        Dodaj stavku
                      </button>
                      {opened.lines.length > 0 ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/quotes/${opened.id}/submit`),
                              'Ponuda predana — po potrebi ide kroz odobrenje.',
                            )
                          }
                          type="button"
                        >
                          Predaj
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {opened.status === 'PENDING_APPROVAL' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/quotes/${opened.id}/sync-approval`), null)
                      }
                      type="button"
                    >
                      Provjeri odobrenje
                    </button>
                  ) : null}
                  {opened.status === 'APPROVED' ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() => setConfirm({ type: 'send', quote: opened })}
                      type="button"
                    >
                      Pošalji kupcu
                    </button>
                  ) : null}
                  {opened.status === 'SENT' ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => setConfirm({ type: 'accept', quote: opened })}
                        type="button"
                      >
                        Označi prihvaćenom
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => setConfirm({ type: 'reject', quote: opened })}
                        type="button"
                      >
                        Označi odbijenom
                      </button>
                    </>
                  ) : null}
                  {['SENT', 'REJECTED', 'EXPIRED'].includes(opened.status) ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/quotes/${opened.id}/new-version`),
                          'Nova verzija (nacrt) kreirana.',
                        )
                      }
                      type="button"
                    >
                      Nova verzija
                    </button>
                  ) : null}
                </div>
              ) : null}

              {opened.status === 'ACCEPTED' && can('order.create') ? (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    style={{ maxWidth: 200 }}
                    value={convertWarehouse}
                    onChange={(e) => setConvertWarehouse(e.target.value)}
                    aria-label="Skladište za ispunjenje"
                  >
                    <option value="">Skladište…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || !convertWarehouse}
                    onClick={() => setConfirm({ type: 'convert', quote: opened })}
                    type="button"
                  >
                    Pretvori u narudžbu
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {confirm?.type === 'send' ? (
        <ConfirmDialog
          open
          title="Slanje ponude kupcu"
          consequence="Poslana ponuda se više ne uređuje — izmjene idu kroz novu verziju."
          confirmLabel="Pošalji kupcu"
          busy={busy}
          onConfirm={() =>
            runConfirmed(
              () => api('POST', `/api/v1/quotes/${confirm.quote.id}/send`),
              'Ponuda poslana kupcu.',
            )
          }
          onCancel={() => setConfirm(null)}
        >
          {confirmFacts(confirm.quote)}
        </ConfirmDialog>
      ) : null}

      {confirm?.type === 'accept' ? (
        <ConfirmDialog
          open
          title="Prihvatanje ponude"
          consequence="Prihvaćena ponuda postaje osnova za narudžbu; konverzija je moguća tačno jednom."
          confirmLabel="Označi prihvaćenom"
          busy={busy}
          onConfirm={() =>
            runConfirmed(
              () => api('POST', `/api/v1/quotes/${confirm.quote.id}/accept`),
              'Ponuda prihvaćena.',
            )
          }
          onCancel={() => setConfirm(null)}
        >
          {confirmFacts(confirm.quote)}
        </ConfirmDialog>
      ) : null}

      {confirm?.type === 'reject' ? (
        <ConfirmDialog
          open
          title="Odbijanje ponude"
          consequence="Ponuda se označava odbijenom; dalje izmjene idu kroz novu verziju."
          confirmLabel="Označi odbijenom"
          danger
          busy={busy}
          onConfirm={() =>
            runConfirmed(
              () => api('POST', `/api/v1/quotes/${confirm.quote.id}/reject`),
              'Ponuda odbijena.',
            )
          }
          onCancel={() => setConfirm(null)}
        >
          {confirmFacts(confirm.quote)}
        </ConfirmDialog>
      ) : null}

      {confirm?.type === 'convert' ? (
        <ConfirmDialog
          open
          title="Konverzija ponude u narudžbu"
          consequence="Kreira narudžbu iz ponude sa stavkama i iznosima ponude; ponovna konverzija iste ponude je odbijena (409)."
          confirmLabel="Pretvori u narudžbu"
          busy={busy}
          onConfirm={() =>
            runConfirmed(async () => {
              const r = await api<{ orderNumber: string }>('POST', '/api/v1/orders/from-quote', {
                quoteId: confirm.quote.id,
                warehouseId: convertWarehouse,
              });
              setConverted({ orderNumber: r.orderNumber });
            }, null)
          }
          onCancel={() => setConfirm(null)}
        >
          {confirmFacts(confirm.quote)}
          <div className="fact">
            <span>Skladište</span>
            <span>{convertWh ? `${convertWh.code} — ${convertWh.name}` : '—'}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
