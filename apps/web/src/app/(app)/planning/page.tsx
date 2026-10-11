'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import {
  formatPromiseDate,
  PromiseLinesTable,
  type PromiseLineCore,
} from '../../../components/delivery-promise';

interface PolicyView {
  id: string;
  skuId: string;
  safetyStock: string;
  reorderPoint: string;
  leadTimeDays: number;
}

interface SuggestionView {
  id: string;
  skuId: string;
  suggestionType: 'PURCHASE' | 'PRODUCTION';
  quantity: string;
  reason: string;
  dueInDays: number;
}

interface MrpRunView {
  id: string;
  runNumber: string;
  demandSkus: number;
  suggestionCount: number;
  createdAt: string;
  suggestions: SuggestionView[];
}

interface SkuOption {
  id: string;
  code: string;
}

interface PromiseCheckLine extends PromiseLineCore {
  skuId: string;
}

interface PromiseCheckResult {
  promisedAt: string;
  lines: PromiseCheckLine[];
  calendar: { workingDays: number[]; holidays: number };
}

interface PromiseCheckRow {
  key: number;
  skuId: string;
  quantity: string;
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Pon',
  2: 'Uto',
  3: 'Sri',
  4: 'Čet',
  5: 'Pet',
  6: 'Sub',
  7: 'Ned',
};

export default function PlanningPage() {
  const { can } = useApp();
  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [runs, setRuns] = useState<MrpRunView[] | null>(null);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [policySku, setPolicySku] = useState('');
  const [safety, setSafety] = useState('0');
  const [lead, setLead] = useState('0');
  const [openRun, setOpenRun] = useState('');
  const [replenishment, setReplenishment] = useState<Array<{
    skuId: string;
    code: string;
    available: number;
    reorderPoint: number;
    suggestedQty: number;
  }> | null>(null);
  // PLAN-015: read-only delivery-promise check (the server computes everything).
  const [checkRows, setCheckRows] = useState<PromiseCheckRow[]>([
    { key: 1, skuId: '', quantity: '1' },
  ]);
  const [checkResult, setCheckResult] = useState<PromiseCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);

  const load = useCallback(() => {
    api<{ policies: PolicyView[] }>('GET', '/api/v1/planning/policies')
      .then((r) => setPolicies(r.policies))
      .catch(() => setPolicies([]));
    api<{ runs: MrpRunView[] }>('GET', '/api/v1/planning/runs')
      .then((r) => {
        setRuns(r.runs);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ rows: NonNullable<typeof replenishment> }>('GET', '/api/v1/planning/replenishment')
      .then((r) => setReplenishment(r.rows))
      .catch(() => setReplenishment([]));
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

  const skuCode = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  function editCheckRow(key: number, patch: Partial<PromiseCheckRow>) {
    setCheckRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setCheckResult(null);
  }

  const checkInvalid = checkRows.some((r) => !r.skuId || !(Number(r.quantity) > 0));

  async function computePromise() {
    setCheckBusy(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const r = await api<PromiseCheckResult>('POST', '/api/v1/planning/promise', {
        lines: checkRows.map((row) => ({ skuId: row.skuId, quantity: Number(row.quantity) })),
      });
      setCheckResult(r);
    } catch (e: unknown) {
      setCheckError(errorText(e));
    } finally {
      setCheckBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Planning</h1>
      <p className="page-sub">
        Safety stock and reorder policies feed the MRP run — open demand minus stock and open
        purchase orders becomes planned production and purchasing.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Planning policies</h2>
            {policies.length === 0 ? (
              <div className="empty">No policies yet — set safety stock for critical SKUs.</div>
            ) : (
              <table className="table">
                <tbody>
                  {policies.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{skuCode(p.skuId)}</td>
                      <td>
                        safety {p.safetyStock} · reorder {p.reorderPoint}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.leadTimeDays}d lead</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {can('plan.manage') ? (
              <form
                className="row"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('PUT', '/api/v1/planning/policies', {
                        skuId: policySku,
                        safetyStock: Number(safety),
                        leadTimeDays: Number(lead),
                      }),
                    'Policy saved.',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 150 }}
                  value={policySku}
                  onChange={(e) => setPolicySku(e.target.value)}
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
                  style={{ maxWidth: 90 }}
                  type="number"
                  min="0"
                  step="any"
                  title="Safety stock"
                  placeholder="Safety"
                  value={safety}
                  onChange={(e) => setSafety(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  min="0"
                  title="Lead time (days)"
                  placeholder="Lead d"
                  value={lead}
                  onChange={(e) => setLead(e.target.value)}
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Save policy
                </button>
              </form>
            ) : null}
          </div>

          {can('plan.manage') ? (
            <div className="card">
              <h2>Run MRP</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Computes net requirements from confirmed orders, safety stock, the stock ledger and
                open purchase orders. Every run is a stored snapshot.
              </p>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() => api('POST', '/api/v1/planning/runs'), 'MRP run completed.')
                }
                type="button"
              >
                {busy ? 'Computing…' : 'Run MRP now'}
              </button>
            </div>
          ) : null}

          <div className="card">
            <h2>Replenishment</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              SKUs at or below their reorder point, with a suggested order quantity.
            </p>
            {replenishment === null ? <div className="loading">Loading…</div> : null}
            {replenishment && replenishment.length === 0 ? (
              <div className="empty">Nothing below its reorder point.</div>
            ) : null}
            {(replenishment ?? []).slice(0, 12).map((row) => (
              <div key={row.skuId} className="row spread" style={{ marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 13 }}>
                  {row.code}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  avail {row.available} / ROP {row.reorderPoint} → order {row.suggestedQty}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>MRP runs</h2>
          {runs === null ? <div className="loading">Loading…</div> : null}
          {runs && runs.length === 0 ? (
            <div className="empty">No runs yet — run MRP to see planned orders.</div>
          ) : null}
          {(runs ?? []).map((r) => (
            <div
              key={r.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <div>
                  <strong className="mono">{r.runNumber}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(r.createdAt).toLocaleString()} · {r.demandSkus} SKUs ·{' '}
                    {r.suggestionCount} suggestion(s)
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => setOpenRun(openRun === r.id ? '' : r.id)}
                  type="button"
                >
                  {openRun === r.id ? 'Hide' : 'Details'}
                </button>
              </div>
              {openRun === r.id ? (
                r.suggestions.length === 0 ? (
                  <div className="empty" style={{ marginTop: 8 }}>
                    Nothing to plan — supply covers demand.
                  </div>
                ) : (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {r.suggestions.map((s) => (
                        <tr key={s.id}>
                          <td className="mono">{skuCode(s.skuId)}</td>
                          <td>
                            <span
                              className={`badge ${
                                s.suggestionType === 'PRODUCTION' ? 'badge-accent' : 'badge-warn'
                              }`}
                            >
                              {s.suggestionType}
                            </span>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {s.reason}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }} className="mono">
                            {s.quantity}
                            {s.dueInDays > 0 ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                due {s.dueInDays}d
                              </div>
                            ) : null}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {s.suggestionType === 'PURCHASE' && can('purchase.request') ? (
                              <button
                                className="btn btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      api('POST', '/api/v1/requisitions/from-suggestion', {
                                        suggestionId: s.id,
                                      }),
                                    'Draft requisition created from the suggestion.',
                                  )
                                }
                                type="button"
                              >
                                → Requisition
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {can('plan.read') ? (
        <section className="card" aria-label="Provjera roka isporuke">
          <h2>Provjera roka isporuke</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Koliko brzo se može isporučiti — iz zaliha, otvorenih narudžbi dobavljačima, radnih
            naloga, kapaciteta proizvodnje ili roka nabavke. Samo provjera, ništa se ne rezerviše.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!checkInvalid) void computePromise();
            }}
          >
            {checkRows.map((row, i) => (
              <div key={row.key} className="row" style={{ marginBottom: 6 }}>
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  aria-label={`SKU, red ${i + 1}`}
                  value={row.skuId}
                  onChange={(e) => editCheckRow(row.key, { skuId: e.target.value })}
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
                  min="0"
                  step="any"
                  aria-label={`Količina, red ${i + 1}`}
                  placeholder="Količina"
                  value={row.quantity}
                  onChange={(e) => editCheckRow(row.key, { quantity: e.target.value })}
                  required
                />
                {checkRows.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Ukloni red ${i + 1}`}
                    onClick={() => {
                      setCheckRows((rows) => rows.filter((r) => r.key !== row.key));
                      setCheckResult(null);
                    }}
                  >
                    Ukloni
                  </button>
                ) : null}
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setCheckRows((rows) => [
                    ...rows,
                    { key: Math.max(0, ...rows.map((r) => r.key)) + 1, skuId: '', quantity: '1' },
                  ]);
                  setCheckResult(null);
                }}
              >
                + Dodaj stavku
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={checkBusy || checkInvalid}
                title={checkInvalid ? 'Svaki red treba SKU i količinu veću od 0.' : undefined}
              >
                {checkBusy ? 'Računam…' : 'Izračunaj'}
              </button>
              {checkInvalid ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  Svaki red treba SKU i količinu veću od 0.
                </span>
              ) : null}
            </div>
          </form>
          {skus.length === 0 ? (
            <div className="empty" style={{ marginTop: 8 }}>
              Nema dostupnih SKU-ova za odabir.
            </div>
          ) : null}
          {checkError ? (
            <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>
              {checkError}
            </div>
          ) : null}
          {checkBusy ? <div className="loading">Računam rok isporuke…</div> : null}
          {checkResult ? (
            <div style={{ marginTop: 12 }} aria-live="polite">
              <div className="row" style={{ gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <span>
                  Najraniji rok za sve stavke:{' '}
                  <strong className="mono">{formatPromiseDate(checkResult.promisedAt)}</strong>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  Radni dani:{' '}
                  {checkResult.calendar.workingDays.map((d) => WEEKDAY_LABELS[d] ?? d).join(', ')} ·
                  praznika u kalendaru: {checkResult.calendar.holidays}
                </span>
              </div>
              {checkResult.lines.length === 0 ? (
                <div className="empty">Nema rezultata.</div>
              ) : (
                <PromiseLinesTable
                  lines={checkResult.lines}
                  rowKey={(l) => `${l.skuId}-${checkResult.lines.indexOf(l)}`}
                  label={(l) => <span className="mono">{skuCode(l.skuId)}</span>}
                />
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
