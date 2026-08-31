'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface QcPlanItemView {
  id: string;
  seq: number;
  name: string;
  requirement: string;
}

interface QcPlanView {
  id: string;
  skuId: string;
  name: string;
  active: boolean;
  items: QcPlanItemView[];
}

interface QcInspectionItemView {
  id: string;
  seq: number;
  name: string;
  requirement: string;
  passed: boolean | null;
}

interface QcInspectionView {
  id: string;
  inspectionNumber: string;
  workOrderId: string;
  skuId: string;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  items: QcInspectionItemView[];
}

interface NcrView {
  id: string;
  ncrNumber: string;
  skuId: string;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED';
  resolution: string | null;
}

interface WorkOrderOption {
  id: string;
  woNumber: string;
  status: string;
}

interface SkuOption {
  id: string;
  code: string;
}

const INSPECTION_BADGE: Record<QcInspectionView['status'], string> = {
  PENDING: 'badge-warn',
  PASSED: 'badge-ok',
  FAILED: 'badge-danger',
};

const SEVERITY_BADGE: Record<NcrView['severity'], string> = {
  MINOR: '',
  MAJOR: 'badge-warn',
  CRITICAL: 'badge-danger',
};

export default function QualityPage() {
  const { can } = useApp();
  const [plans, setPlans] = useState<QcPlanView[]>([]);
  const [inspections, setInspections] = useState<QcInspectionView[] | null>(null);
  const [ncrs, setNcrs] = useState<NcrView[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [planSku, setPlanSku] = useState('');
  const [planName, setPlanName] = useState('');
  const [planChecks, setPlanChecks] = useState('');
  const [inspectionWo, setInspectionWo] = useState('');
  const [resolveNcr, setResolveNcr] = useState('');
  const [resolution, setResolution] = useState('');

  const load = useCallback(() => {
    api<{ plans: QcPlanView[] }>('GET', '/api/v1/qc/plans')
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
    api<{ inspections: QcInspectionView[] }>('GET', '/api/v1/qc/inspections')
      .then((r) => {
        setInspections(r.inspections);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ ncrs: NcrView[] }>('GET', '/api/v1/qc/ncrs')
      .then((r) => setNcrs(r.ncrs))
      .catch(() => setNcrs([]));
    api<{ workOrders: WorkOrderOption[] }>('GET', '/api/v1/work-orders')
      .then((r) => setWorkOrders(r.workOrders))
      .catch(() => setWorkOrders([]));
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
  const woNumber = (id: string) => workOrders.find((w) => w.id === id)?.woNumber ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Quality</h1>
      <p className="page-sub">
        QC plans per SKU, inspections that block production completion, and nonconformance reports
        opened automatically on failure.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>QC plans</h2>
            {plans.length === 0 ? (
              <div className="empty">No QC plans — production completes without inspection.</div>
            ) : null}
            {plans.map((p) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <strong>
                    {p.name} <span className="mono muted">({skuCode(p.skuId)})</span>
                  </strong>
                  <span className={`badge ${p.active ? 'badge-ok' : ''}`}>
                    {p.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {p.items.map((i) => (
                      <tr key={i.id}>
                        <td className="mono">{i.seq}</td>
                        <td>{i.name}</td>
                        <td className="muted">{i.requirement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {can('qc.manage') ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const items = planChecks
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [name, requirement] = line.split('|');
                      return {
                        name: (name ?? '').trim(),
                        requirement: (requirement ?? name ?? '').trim(),
                      };
                    });
                  void run(
                    () =>
                      api('POST', '/api/v1/qc/plans', { skuId: planSku, name: planName, items }),
                    'QC plan created — production of this SKU now requires inspection.',
                  ).then(() => {
                    setPlanName('');
                    setPlanChecks('');
                  });
                }}
              >
                <label className="label">SKU</label>
                <select
                  className="select"
                  value={planSku}
                  onChange={(e) => setPlanSku(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <label className="label">Plan name</label>
                <input
                  className="input"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  required
                />
                <label className="label">Checks (one per line, “name | requirement”)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={planChecks}
                  onChange={(e) => setPlanChecks(e.target.value)}
                  required
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  type="submit"
                >
                  Create plan
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Nonconformance reports</h2>
            {ncrs.length === 0 ? <div className="empty">No NCRs — quality is holding.</div> : null}
            {ncrs.map((n) => (
              <div
                key={n.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <strong className="mono">{n.ncrNumber}</strong>
                  <span>
                    <span className={`badge ${SEVERITY_BADGE[n.severity]}`}>{n.severity}</span>{' '}
                    <span className={`badge ${n.status === 'OPEN' ? 'badge-danger' : 'badge-ok'}`}>
                      {n.status}
                    </span>
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 14 }}>{n.description}</div>
                {n.resolution ? (
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    Resolution: {n.resolution}
                  </div>
                ) : null}
                {n.status === 'OPEN' && can('qc.approve') ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      style={{ maxWidth: 260 }}
                      placeholder="Resolution…"
                      value={resolveNcr === n.id ? resolution : ''}
                      onChange={(e) => {
                        setResolveNcr(n.id);
                        setResolution(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy || resolveNcr !== n.id || !resolution.trim()}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/qc/ncrs/${n.id}/resolve`, { resolution }),
                          'NCR resolved.',
                        ).then(() => setResolution(''))
                      }
                      type="button"
                    >
                      Resolve
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Inspections</h2>
          {can('qc.record') ? (
            <form
              className="row"
              style={{ marginBottom: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => api('POST', '/api/v1/qc/inspections', { workOrderId: inspectionWo }),
                  'Inspection opened from the SKU plan.',
                );
              }}
            >
              <select
                className="select"
                style={{ maxWidth: 220 }}
                value={inspectionWo}
                onChange={(e) => setInspectionWo(e.target.value)}
                required
              >
                <option value="">Work order…</option>
                {workOrders
                  .filter((w) => ['IN_PROGRESS', 'RELEASED', 'PAUSED'].includes(w.status))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.woNumber}
                    </option>
                  ))}
              </select>
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Open inspection
              </button>
            </form>
          ) : null}

          {inspections === null ? <div className="loading">Loading…</div> : null}
          {inspections && inspections.length === 0 ? (
            <div className="empty">No inspections yet.</div>
          ) : null}
          {(inspections ?? []).map((i) => (
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
                  <strong className="mono">{i.inspectionNumber}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {woNumber(i.workOrderId)} · {skuCode(i.skuId)}
                  </div>
                </div>
                <span className={`badge ${INSPECTION_BADGE[i.status]}`}>{i.status}</span>
              </div>
              <table className="table" style={{ marginTop: 8 }}>
                <tbody>
                  {i.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {item.requirement}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {i.status === 'PENDING' && can('qc.record') ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className={`btn btn-sm ${item.passed === true ? 'btn-primary' : ''}`}
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api('POST', `/api/v1/qc/inspections/${i.id}/items`, {
                                      itemId: item.id,
                                      passed: true,
                                    }),
                                  null,
                                )
                              }
                              type="button"
                            >
                              Pass
                            </button>
                            <button
                              className={`btn btn-sm ${item.passed === false ? 'btn-danger' : ''}`}
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api('POST', `/api/v1/qc/inspections/${i.id}/items`, {
                                      itemId: item.id,
                                      passed: false,
                                    }),
                                  null,
                                )
                              }
                              type="button"
                            >
                              Fail
                            </button>
                          </span>
                        ) : item.passed === null ? (
                          <span className="badge badge-warn">—</span>
                        ) : item.passed ? (
                          <span className="badge badge-ok">PASS</span>
                        ) : (
                          <span className="badge badge-danger">FAIL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {i.status === 'PENDING' && can('qc.approve') ? (
                <button
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: 8 }}
                  disabled={busy || i.items.some((item) => item.passed === null)}
                  onClick={() =>
                    run(
                      () => api('POST', `/api/v1/qc/inspections/${i.id}/finalize`),
                      'Inspection finalized.',
                    )
                  }
                  type="button"
                >
                  Finalize (supervisor)
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
