'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface LineView {
  id: string;
  skuId: string;
  expectedQty: string;
  processedQty: string;
}

interface OrderView {
  id: string;
  orderType: 'RECEIVING' | 'TRANSFER' | 'COUNT' | 'PICK';
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  warehouseId: string;
  toWarehouseId: string | null;
  reference: string | null;
  lines: LineView[];
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

const STATUS_BADGE: Record<OrderView['status'], string> = {
  DRAFT: 'badge-warn',
  IN_PROGRESS: 'badge-accent',
  COMPLETED: 'badge-ok',
  CANCELLED: '',
};

function randomKey(): string {
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function OperationsPage() {
  const { can } = useApp();
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orderType, setOrderType] = useState<OrderView['orderType']>('RECEIVING');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [qty, setQty] = useState('1');
  const [reference, setReference] = useState('');

  const load = useCallback(() => {
    api<{ orders: OrderView[] }>('GET', '/api/v1/wms/orders')
      .then((r) => {
        setOrders(r.orders);
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
        if (first) setWarehouseId(first.id);
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
        const all = details.flatMap((d) => d.skus);
        setSkus(all);
        const first = all[0];
        if (first) setSkuId(first.id);
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

  const whLabel = (id: string | null) =>
    id ? (warehouses.find((w) => w.id === id)?.code ?? id.slice(0, 8)) : '—';
  const skuLabel = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Warehouse operations</h1>
      <p className="page-sub">
        Receiving, transfers, counts and picks — every effect is a ledger movement, retriable and
        exactly-once.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Orders</h2>
          {orders === null ? <div className="loading">Loading orders…</div> : null}
          {orders && orders.length === 0 ? (
            <div className="empty">No orders yet — create one to start executing.</div>
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
                  <strong>{o.orderType}</strong>{' '}
                  <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {whLabel(o.warehouseId)}
                    {o.toWarehouseId ? ` → ${whLabel(o.toWarehouseId)}` : ''}
                    {o.reference ? ` · ${o.reference}` : ''}
                  </div>
                </div>
                <div className="row">
                  {o.status === 'DRAFT' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/wms/orders/${o.id}/start`), null)
                      }
                      type="button"
                    >
                      Start
                    </button>
                  ) : null}
                  {o.status === 'IN_PROGRESS' ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/wms/orders/${o.id}/complete`), 'Completed.')
                      }
                      type="button"
                    >
                      Complete
                    </button>
                  ) : null}
                </div>
              </div>
              <table className="table" style={{ marginTop: 8 }}>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{skuLabel(l.skuId)}</td>
                      <td>
                        {l.processedQty} / {l.expectedQty}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {o.status === 'IN_PROGRESS' ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  api('POST', `/api/v1/wms/orders/${o.id}/lines/${l.id}/process`, {
                                    quantity:
                                      Number(l.expectedQty) - Number(l.processedQty) > 0
                                        ? Number(l.expectedQty) - Number(l.processedQty)
                                        : Number(l.expectedQty),
                                    idempotencyKey: randomKey(),
                                  }),
                                'Line processed.',
                              )
                            }
                            type="button"
                          >
                            {o.orderType === 'COUNT' ? 'Confirm count' : 'Process remaining'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api('POST', '/api/v1/wms/orders', {
                  orderType,
                  warehouseId,
                  ...(orderType === 'TRANSFER' ? { toWarehouseId } : {}),
                  ...(reference ? { reference } : {}),
                  lines: [{ skuId, expectedQty: Number(qty) }],
                }),
              'Order created (draft).',
            );
          }}
        >
          <h2>New order</h2>
          <label className="label">Type</label>
          <select
            className="select"
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as OrderView['orderType'])}
          >
            {can('inventory.receive') ? <option value="RECEIVING">Receiving</option> : null}
            {can('inventory.transfer') ? <option value="TRANSFER">Transfer</option> : null}
            {can('inventory.count') ? <option value="COUNT">Cycle count</option> : null}
            {can('inventory.pick') ? <option value="PICK">Pick</option> : null}
          </select>
          <label className="label">Warehouse</label>
          <select
            className="select"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          {orderType === 'TRANSFER' ? (
            <>
              <label className="label">Destination warehouse</label>
              <select
                className="select"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {warehouses
                  .filter((w) => w.id !== warehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
              </select>
            </>
          ) : null}
          <label className="label">SKU</label>
          <select
            className="select"
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {skus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <label className="label">
            {orderType === 'COUNT' ? 'Counted quantity' : 'Expected quantity'}
          </label>
          <input
            className="input"
            type="number"
            min="0.000001"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
          <label className="label">Reference (optional)</label>
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
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
      </div>
    </main>
  );
}
