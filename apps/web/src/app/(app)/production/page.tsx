'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface WoOperationView {
  id: string;
  seq: number;
  name: string;
  workCenter: string;
  status: 'PENDING' | 'RUNNING' | 'DONE';
}

interface WorkOrderView {
  id: string;
  woNumber: string;
  skuId: string;
  quantity: string;
  goodQuantity: string;
  scrapQuantity: string;
  status: 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  operations: WoOperationView[];
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

const WO_BADGE: Record<WorkOrderView['status'], string> = {
  PLANNED: 'badge-warn',
  RELEASED: 'badge-accent',
  IN_PROGRESS: 'badge-accent',
  PAUSED: 'badge-warn',
  COMPLETED: 'badge-ok',
  CANCELLED: 'badge-danger',
};

export default function ProductionPage() {
  const { can } = useApp();
  const [workOrders, setWorkOrders] = useState<WorkOrderView[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newSku, setNewSku] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newQty, setNewQty] = useState('10');
  const [completeWo, setCompleteWo] = useState('');
  const [goodQty, setGoodQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');

  const load = useCallback(() => {
    api<{ workOrders: WorkOrderView[] }>('GET', '/api/v1/work-orders')
      .then((r) => {
        setWorkOrders(r.workOrders);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
      .then((r) => {
        setWarehouses(r.warehouses);
        const first = r.warehouses[0];
        if (first) setNewWarehouse(first.id);
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

  const skuCode = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);
  const wip = (workOrders ?? []).filter((w) =>
    ['RELEASED', 'IN_PROGRESS', 'PAUSED'].includes(w.status),
  ).length;

  return (
    <main className="page">
      <h1>Production</h1>
      <p className="page-sub">
        Work orders against released BOMs — material issued from the ledger at release, good
        quantity received back at completion, scrap recorded. {wip} in WIP.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          {can('production.manage') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/work-orders', {
                      skuId: newSku,
                      warehouseId: newWarehouse,
                      quantity: Number(newQty),
                    }),
                  'Work order planned.',
                );
              }}
            >
              <h2>New work order</h2>
              <label className="label">Output SKU (needs a released BOM)</label>
              <select
                className="select"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                required
              >
                <option value="">Select SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
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
              <label className="label">Quantity</label>
              <input
                className="input"
                style={{ maxWidth: 120 }}
                type="number"
                min="1"
                step="any"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                required
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Plan work order
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Work orders</h2>
          {workOrders === null ? <div className="loading">Loading…</div> : null}
          {workOrders && workOrders.length === 0 ? (
            <div className="empty">No work orders yet — plan one from a released BOM.</div>
          ) : null}
          {(workOrders ?? []).map((wo) => (
            <div
              key={wo.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <div>
                  <strong className="mono">{wo.woNumber}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {skuCode(wo.skuId)} × {wo.quantity}
                    {wo.status === 'COMPLETED'
                      ? ` · good ${wo.goodQuantity} / scrap ${wo.scrapQuantity}`
                      : ''}
                  </div>
                </div>
                <span className={`badge ${WO_BADGE[wo.status]}`}>
                  {wo.status.replace('_', ' ')}
                </span>
              </div>

              {wo.operations.length > 0 ? (
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {wo.operations.map((op) => (
                      <tr key={op.id}>
                        <td className="mono">{op.seq}</td>
                        <td>
                          {op.name} <span className="muted">@ {op.workCenter}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {op.status === 'DONE' ? (
                            <span className="badge badge-ok">DONE</span>
                          ) : wo.status === 'IN_PROGRESS' && can('production.execute') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api(
                                      'POST',
                                      `/api/v1/work-orders/${wo.id}/operations/${op.id}/complete`,
                                    ),
                                  null,
                                )
                              }
                              type="button"
                            >
                              Complete
                            </button>
                          ) : (
                            <span className="badge badge-warn">{op.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <div className="row" style={{ marginTop: 8 }}>
                {wo.status === 'PLANNED' && can('production.manage') ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api('POST', `/api/v1/work-orders/${wo.id}/release`),
                        'Released — material issued from the ledger.',
                      )
                    }
                    type="button"
                  >
                    Release (issue material)
                  </button>
                ) : null}
                {['RELEASED', 'PAUSED'].includes(wo.status) && can('production.execute') ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() =>
                      run(() => api('POST', `/api/v1/work-orders/${wo.id}/start`), null)
                    }
                    type="button"
                  >
                    {wo.status === 'PAUSED' ? 'Resume' : 'Start'}
                  </button>
                ) : null}
                {wo.status === 'IN_PROGRESS' && can('production.execute') ? (
                  <>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/work-orders/${wo.id}/pause`), null)
                      }
                      type="button"
                    >
                      Pause
                    </button>
                    {completeWo === wo.id ? (
                      <>
                        <input
                          className="input"
                          style={{ maxWidth: 80 }}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Good"
                          value={goodQty}
                          onChange={(e) => setGoodQty(e.target.value)}
                        />
                        <input
                          className="input"
                          style={{ maxWidth: 80 }}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Scrap"
                          value={scrapQty}
                          onChange={(e) => setScrapQty(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy || goodQty === ''}
                          onClick={() =>
                            run(
                              () =>
                                api('POST', `/api/v1/work-orders/${wo.id}/complete`, {
                                  goodQuantity: Number(goodQty),
                                  scrapQuantity: Number(scrapQty),
                                }),
                              'Completed — output received into stock.',
                            ).then(() => setCompleteWo(''))
                          }
                          type="button"
                        >
                          Confirm
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setCompleteWo(wo.id);
                          setGoodQty(wo.quantity);
                          setScrapQty('0');
                        }}
                        type="button"
                      >
                        Complete…
                      </button>
                    )}
                  </>
                ) : null}
                {['PLANNED', 'RELEASED'].includes(wo.status) && can('production.manage') ? (
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api('POST', `/api/v1/work-orders/${wo.id}/cancel`),
                        'Cancelled — issued material returned.',
                      )
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
