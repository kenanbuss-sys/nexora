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

const STATUS_COLOR: Record<WorkOrderView['status'], string> = {
  PLANNED: '#94a3b8',
  RELEASED: '#f59e0b',
  IN_PROGRESS: '#2563eb',
  PAUSED: '#f59e0b',
  COMPLETED: '#16a34a',
  CANCELLED: '#dc2626',
};

/**
 * Shop-floor kiosk (MES-018): large-type, low-choice execution screen
 * for operators. Everything it does goes through the same governed MES
 * commands as the back office — no special shop-floor shortcuts.
 */
export default function KioskPage() {
  const { can } = useApp();
  const [workOrders, setWorkOrders] = useState<WorkOrderView[] | null>(null);
  const [selected, setSelected] = useState<WorkOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [good, setGood] = useState('');
  const [scrap, setScrap] = useState('0');

  const load = useCallback(() => {
    api<{ workOrders: WorkOrderView[] }>('GET', '/api/v1/work-orders')
      .then((r) => {
        const active = r.workOrders.filter((w) =>
          ['RELEASED', 'IN_PROGRESS', 'PAUSED'].includes(w.status),
        );
        setWorkOrders(active);
        setSelected((current) => {
          if (!current) return current;
          return active.find((w) => w.id === current.id) ?? null;
        });
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can('production.execute')) {
    return (
      <main className="page">
        <h1>Shop floor</h1>
        <div className="alert alert-error">This kiosk needs the production.execute permission.</div>
      </main>
    );
  }

  const big: React.CSSProperties = {
    fontSize: 22,
    padding: '18px 26px',
    borderRadius: 14,
    fontWeight: 750,
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
  };

  return (
    <main className="page" style={{ maxWidth: 1000 }}>
      <div className="spread">
        <h1 style={{ fontSize: 30 }}>Shop floor</h1>
        {selected ? (
          <button
            className="btn"
            style={{ fontSize: 18, padding: '10px 20px' }}
            onClick={() => setSelected(null)}
            type="button"
          >
            ← All work orders
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="alert alert-error" style={{ fontSize: 18 }}>
          {error}
        </div>
      ) : null}

      {!selected ? (
        <>
          {workOrders === null ? <div className="loading">Loading…</div> : null}
          {workOrders && workOrders.length === 0 ? (
            <div className="empty" style={{ fontSize: 20, padding: 40 }}>
              No released work orders. Enjoy the quiet.
            </div>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {(workOrders ?? []).map((wo) => (
              <button
                key={wo.id}
                onClick={() => {
                  setSelected(wo);
                  setGood(wo.quantity);
                  setScrap('0');
                }}
                type="button"
                style={{
                  textAlign: 'left',
                  background: 'var(--color-surface, #fff)',
                  border: `3px solid ${STATUS_COLOR[wo.status]}`,
                  borderRadius: 16,
                  padding: 20,
                  cursor: 'pointer',
                }}
              >
                <div className="mono" style={{ fontSize: 24, fontWeight: 800 }}>
                  {wo.woNumber}
                </div>
                <div style={{ fontSize: 18, margin: '6px 0' }}>
                  Qty: <strong>{wo.quantity}</strong>
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    background: STATUS_COLOR[wo.status],
                    color: '#fff',
                    borderRadius: 8,
                    padding: '4px 12px',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {wo.status.replace('_', ' ')}
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                  {wo.operations.filter((o) => o.status === 'DONE').length}/{wo.operations.length}{' '}
                  operations done
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <div className="spread" style={{ marginBottom: 14 }}>
            <div className="mono" style={{ fontSize: 34, fontWeight: 800 }}>
              {selected.woNumber}
            </div>
            <div
              style={{
                background: STATUS_COLOR[selected.status],
                color: '#fff',
                borderRadius: 10,
                padding: '8px 18px',
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              {selected.status.replace('_', ' ')}
            </div>
          </div>

          <div className="row" style={{ marginBottom: 18 }}>
            {selected.status === 'RELEASED' || selected.status === 'PAUSED' ? (
              <button
                style={{ ...big, background: '#16a34a' }}
                disabled={busy}
                onClick={() =>
                  void run(() => api('POST', `/api/v1/work-orders/${selected.id}/start`))
                }
                type="button"
              >
                ▶ START
              </button>
            ) : null}
            {selected.status === 'IN_PROGRESS' ? (
              <button
                style={{ ...big, background: '#f59e0b' }}
                disabled={busy}
                onClick={() =>
                  void run(() => api('POST', `/api/v1/work-orders/${selected.id}/pause`))
                }
                type="button"
              >
                ⏸ PAUSE
              </button>
            ) : null}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            {selected.operations
              .sort((a, z) => a.seq - z.seq)
              .map((op) => {
                const blocked = selected.operations.some(
                  (o) => o.seq < op.seq && o.status !== 'DONE',
                );
                return (
                  <div
                    key={op.id}
                    className="spread"
                    style={{
                      padding: '14px 6px',
                      borderBottom: '1px solid var(--color-border)',
                      opacity: op.status === 'DONE' ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontSize: 20 }}>
                      <span className="mono muted" style={{ marginRight: 10 }}>
                        {op.seq}.
                      </span>
                      <strong>{op.name}</strong>{' '}
                      <span className="muted" style={{ fontSize: 15 }}>
                        @ {op.workCenter}
                      </span>
                    </div>
                    {op.status === 'DONE' ? (
                      <span style={{ fontSize: 26 }}>✅</span>
                    ) : selected.status === 'IN_PROGRESS' ? (
                      <button
                        style={{
                          ...big,
                          fontSize: 17,
                          padding: '10px 22px',
                          background: blocked ? '#94a3b8' : '#2563eb',
                        }}
                        disabled={busy || blocked}
                        onClick={() =>
                          void run(() =>
                            api(
                              'POST',
                              `/api/v1/work-orders/${selected.id}/operations/${op.id}/complete`,
                            ),
                          )
                        }
                        type="button"
                      >
                        DONE
                      </button>
                    ) : (
                      <span className="muted">waiting</span>
                    )}
                  </div>
                );
              })}
          </div>

          {selected.status === 'IN_PROGRESS' &&
          selected.operations.every((o) => o.status === 'DONE') ? (
            <div className="card" style={{ background: '#f0fdf4' }}>
              <h2 style={{ fontSize: 22 }}>Finish work order</h2>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div>
                  <label className="label" style={{ fontSize: 16 }}>
                    Good quantity
                  </label>
                  <input
                    className="input"
                    style={{ fontSize: 26, width: 140, textAlign: 'center' }}
                    type="number"
                    min="0"
                    step="any"
                    value={good}
                    onChange={(e) => setGood(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: 16 }}>
                    Scrap
                  </label>
                  <input
                    className="input"
                    style={{ fontSize: 26, width: 120, textAlign: 'center' }}
                    type="number"
                    min="0"
                    step="any"
                    value={scrap}
                    onChange={(e) => setScrap(e.target.value)}
                  />
                </div>
                <button
                  style={{ ...big, background: '#16a34a' }}
                  disabled={busy || good === ''}
                  onClick={() =>
                    void run(() =>
                      api('POST', `/api/v1/work-orders/${selected.id}/complete`, {
                        goodQuantity: Number(good),
                        scrapQuantity: Number(scrap || 0),
                      }),
                    )
                  }
                  type="button"
                >
                  ✔ FINISH
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
