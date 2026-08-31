'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

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
    </main>
  );
}
