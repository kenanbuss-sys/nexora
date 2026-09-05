'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface SupplierPerformanceRow {
  supplierId: string;
  supplierName: string;
  poCount: number;
  spend: string;
  fillRatePct: string;
  avgReceiptDays: string | null;
}

interface SupplierView {
  id: string;
  supplierNumber: string;
  partyName: string;
  status: 'ACTIVE' | 'BLOCKED';
  leadTimeDays: number | null;
}

interface RequisitionLineView {
  id: string;
  description: string;
  quantity: string;
  estUnitPrice: string;
  lineTotal: string;
}

interface RequisitionView {
  id: string;
  requisitionNumber: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';
  currency: string;
  total: string;
  lines: RequisitionLineView[];
}

interface PoLineView {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  receivedQty: string;
}

interface PurchaseOrderView {
  id: string;
  poNumber: string;
  supplierId: string;
  status: 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  currency: string;
  total: string;
  lines: PoLineView[];
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

const REQ_BADGE: Record<RequisitionView['status'], string> = {
  DRAFT: 'badge-warn',
  PENDING_APPROVAL: 'badge-warn',
  APPROVED: 'badge-accent',
  REJECTED: 'badge-danger',
  CONVERTED: 'badge-ok',
  CANCELLED: '',
};

const PO_BADGE: Record<PurchaseOrderView['status'], string> = {
  OPEN: 'badge-warn',
  PARTIALLY_RECEIVED: 'badge-accent',
  RECEIVED: 'badge-ok',
  CANCELLED: 'badge-danger',
};

export default function ProcurementPage() {
  const { can } = useApp();
  const [suppliers, setSuppliers] = useState<SupplierView[]>([]);
  const [performance, setPerformance] = useState<SupplierPerformanceRow[]>([]);
  const [requisitions, setRequisitions] = useState<RequisitionView[] | null>(null);
  const [pos, setPos] = useState<PurchaseOrderView[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [supName, setSupName] = useState('');
  const [supLead, setSupLead] = useState('');
  const [reqCurrency, setReqCurrency] = useState('EUR');
  const [lineReq, setLineReq] = useState('');
  const [lineSku, setLineSku] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('');
  const [poReq, setPoReq] = useState('');
  const [poSupplier, setPoSupplier] = useState('');
  const [poWarehouse, setPoWarehouse] = useState('');
  const [receivePo, setReceivePo] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<{ suppliers: SupplierView[] }>('GET', '/api/v1/suppliers')
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers([]));
    api<{ suppliers: SupplierPerformanceRow[] }>('GET', '/api/v1/suppliers/performance')
      .then((r) => setPerformance(r.suppliers))
      .catch(() => setPerformance([]));
    api<{ requisitions: RequisitionView[] }>('GET', '/api/v1/requisitions')
      .then((r) => {
        setRequisitions(r.requisitions);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ purchaseOrders: PurchaseOrderView[] }>('GET', '/api/v1/purchase-orders')
      .then((r) => setPos(r.purchaseOrders))
      .catch(() => setPos([]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
      .then((r) => {
        setWarehouses(r.warehouses);
        const first = r.warehouses[0];
        if (first) setPoWarehouse(first.id);
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

  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.partyName ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Procurement</h1>
      <p className="page-sub">
        Suppliers, requisitions with approval above 1000, purchase orders and goods receipt straight
        into the stock ledger.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Suppliers</h2>
            {suppliers.length === 0 ? <div className="empty">No suppliers yet.</div> : null}
            {suppliers.length > 0 ? (
              <table className="table">
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.supplierNumber}</td>
                      <td>
                        {s.partyName}
                        {s.leadTimeDays !== null ? (
                          <span className="muted"> · {s.leadTimeDays}d lead</span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`badge ${s.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {can('purchase.manage') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  api(
                                    'POST',
                                    `/api/v1/suppliers/${s.id}/${s.status === 'ACTIVE' ? 'block' : 'activate'}`,
                                  ),
                                null,
                              )
                            }
                            type="button"
                          >
                            {s.status === 'ACTIVE' ? 'Block' : 'Activate'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {can('purchase.manage') ? (
              <form
                className="row"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/suppliers', {
                        name: supName,
                        ...(supLead ? { leadTimeDays: Number(supLead) } : {}),
                      }),
                    'Supplier created.',
                  ).then(() => {
                    setSupName('');
                    setSupLead('');
                  });
                }}
              >
                <input
                  className="input"
                  style={{ maxWidth: 200 }}
                  placeholder="Supplier name"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  style={{ maxWidth: 100 }}
                  type="number"
                  min="0"
                  placeholder="Lead (d)"
                  value={supLead}
                  onChange={(e) => setSupLead(e.target.value)}
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Add supplier
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Requisitions</h2>
            {requisitions === null ? <div className="loading">Loading…</div> : null}
            {requisitions && requisitions.length === 0 ? (
              <div className="empty">No requisitions yet — request a purchase below.</div>
            ) : null}
            {(requisitions ?? []).map((r) => (
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
                    <strong className="mono">{r.requisitionNumber}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.total} {r.currency}
                    </div>
                  </div>
                  <span className={`badge ${REQ_BADGE[r.status]}`}>{r.status}</span>
                </div>
                {r.lines.length > 0 ? (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {r.lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td>
                            {l.quantity} × {l.estUnitPrice}
                          </td>
                          <td style={{ textAlign: 'right' }}>{l.lineTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                <div className="row" style={{ marginTop: 8 }}>
                  {r.status === 'DRAFT' && can('purchase.request') ? (
                    <>
                      <select
                        className="select"
                        style={{ maxWidth: 140 }}
                        value={lineReq === r.id ? lineSku : ''}
                        onChange={(e) => {
                          setLineReq(r.id);
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
                        value={lineReq === r.id ? lineQty : '1'}
                        onChange={(e) => {
                          setLineReq(r.id);
                          setLineQty(e.target.value);
                        }}
                      />
                      <input
                        className="input"
                        style={{ maxWidth: 90 }}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Est. price"
                        value={lineReq === r.id ? linePrice : ''}
                        onChange={(e) => {
                          setLineReq(r.id);
                          setLinePrice(e.target.value);
                        }}
                      />
                      <button
                        className="btn btn-sm"
                        disabled={busy || lineReq !== r.id || !lineSku || linePrice === ''}
                        onClick={() =>
                          run(
                            () =>
                              api('POST', `/api/v1/requisitions/${r.id}/lines`, {
                                skuId: lineSku,
                                quantity: Number(lineQty),
                                estUnitPrice: Number(linePrice),
                              }),
                            null,
                          )
                        }
                        type="button"
                      >
                        Add line
                      </button>
                      {r.lines.length > 0 ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => api('POST', `/api/v1/requisitions/${r.id}/submit`),
                              'Requisition submitted.',
                            )
                          }
                          type="button"
                        >
                          Submit
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {r.status === 'PENDING_APPROVAL' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => api('POST', `/api/v1/requisitions/${r.id}/sync-approval`), null)
                      }
                      type="button"
                    >
                      Check approval
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {can('purchase.request') ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/requisitions', { currency: reqCurrency }),
                    'Requisition created (draft).',
                  );
                }}
              >
                <input
                  className="input mono"
                  style={{ maxWidth: 70 }}
                  value={reqCurrency}
                  onChange={(e) => setReqCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
                <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
                  New requisition
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div>
          {can('purchase.manage') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/purchase-orders', {
                      requisitionId: poReq,
                      supplierId: poSupplier,
                      warehouseId: poWarehouse,
                    }),
                  'Purchase order issued.',
                );
              }}
            >
              <h2>Issue purchase order</h2>
              <label className="label">Approved requisition</label>
              <select
                className="select"
                value={poReq}
                onChange={(e) => setPoReq(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {(requisitions ?? [])
                  .filter((r) => r.status === 'APPROVED')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.requisitionNumber} — {r.total} {r.currency}
                    </option>
                  ))}
              </select>
              <label className="label">Supplier</label>
              <select
                className="select"
                value={poSupplier}
                onChange={(e) => setPoSupplier(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {suppliers
                  .filter((s) => s.status === 'ACTIVE')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplierNumber} — {s.partyName}
                    </option>
                  ))}
              </select>
              <label className="label">Deliver to warehouse</label>
              <select
                className="select"
                value={poWarehouse}
                onChange={(e) => setPoWarehouse(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Issue PO
              </button>
            </form>
          ) : null}

          <div className="card">
            <h2>Purchase orders</h2>
            {pos.length === 0 ? (
              <div className="empty">No purchase orders yet — convert an approved requisition.</div>
            ) : null}
            {pos.map((po) => (
              <div
                key={po.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div className="spread">
                  <div>
                    <strong className="mono">{po.poNumber}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {supplierName(po.supplierId)} · {po.total} {po.currency}
                    </div>
                  </div>
                  <span className={`badge ${PO_BADGE[po.status]}`}>{po.status}</span>
                </div>
                {po.lines.length > 0 ? (
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {po.lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td>
                            {l.receivedQty} / {l.quantity} received
                          </td>
                          {receivePo === po.id &&
                          ['OPEN', 'PARTIALLY_RECEIVED'].includes(po.status) ? (
                            <td style={{ textAlign: 'right' }}>
                              <input
                                className="input"
                                style={{ maxWidth: 80 }}
                                type="number"
                                min="0"
                                step="any"
                                placeholder="Qty"
                                value={receiveQty[l.id] ?? ''}
                                onChange={(e) =>
                                  setReceiveQty((m) => ({ ...m, [l.id]: e.target.value }))
                                }
                              />
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                <div className="row" style={{ marginTop: 8 }}>
                  {['OPEN', 'PARTIALLY_RECEIVED'].includes(po.status) && can('purchase.receive') ? (
                    receivePo === po.id ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy || !Object.values(receiveQty).some((v) => Number(v) > 0)}
                          onClick={() =>
                            run(
                              () =>
                                api('POST', `/api/v1/purchase-orders/${po.id}/receive`, {
                                  receiptKey: `ui-${Date.now()}`,
                                  lines: Object.entries(receiveQty)
                                    .filter(([, v]) => Number(v) > 0)
                                    .map(([lineId, v]) => ({
                                      lineId,
                                      quantity: Number(v),
                                    })),
                                }),
                              'Goods received into the ledger.',
                            ).then(() => {
                              setReceivePo('');
                              setReceiveQty({});
                            })
                          }
                          type="button"
                        >
                          Post receipt
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setReceivePo('');
                            setReceiveQty({});
                          }}
                          type="button"
                        >
                          Close
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setReceivePo(po.id)}
                        type="button"
                      >
                        Receive goods
                      </button>
                    )
                  ) : null}
                  {po.status === 'OPEN' && can('purchase.manage') ? (
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/purchase-orders/${po.id}/cancel`),
                          'PO cancelled.',
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
      </div>
      {performance.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Supplier performance</h2>
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Supplier</th>
                <th>Orders</th>
                <th>Spend</th>
                <th>Fill rate</th>
                <th>Avg. receipt time</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.supplierName}</td>
                  <td style={{ textAlign: 'center' }}>{row.poCount}</td>
                  <td style={{ textAlign: 'center' }} className="mono">
                    {row.spend}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      className={`badge ${
                        Number(row.fillRatePct) >= 95
                          ? 'badge-ok'
                          : Number(row.fillRatePct) >= 70
                            ? 'badge-warn'
                            : 'badge-danger'
                      }`}
                    >
                      {row.fillRatePct}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }} className="mono">
                    {row.avgReceiptDays !== null ? `${row.avgReceiptDays} d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
