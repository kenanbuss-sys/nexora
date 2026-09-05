'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface WarehouseView {
  id: string;
  code: string;
  name: string;
}

interface SkuOption {
  id: string;
  code: string;
  status: string;
}

interface Position {
  onHand: string;
  reserved: string;
  available: string;
}

interface LotBalance {
  lotNumber: string;
  onHand: string;
  expiresAt: string | null;
  expired: boolean;
  expiringSoon: boolean;
}

interface CountLineView {
  id: string;
  skuId: string;
  expectedQty: string;
  countedQty: string;
  variance: string;
}

interface CountView {
  id: string;
  countNumber: string;
  warehouseId: string;
  status: 'OPEN' | 'POSTED' | 'CANCELLED';
  lines: CountLineView[];
}

interface Movement {
  id: string;
  movementType: string;
  quantity: string;
  reason: string | null;
  idempotencyKey: string;
  occurredAt: string;
}

interface Reservation {
  id: string;
  quantity: string;
  status: string;
  reference: string | null;
  createdAt: string;
}

const MOVEMENT_TYPES = [
  'RECEIPT',
  'ISSUE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;

function randomKey(): string {
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function InventoryPage() {
  const { can } = useApp();
  const [warehouses, setWarehouses] = useState<WarehouseView[] | null>(null);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [whCode, setWhCode] = useState('');
  const [whName, setWhName] = useState('');
  const [movementType, setMovementType] = useState<string>('RECEIPT');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [reserveQty, setReserveQty] = useState('1');
  const [reference, setReference] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [lots, setLots] = useState<LotBalance[]>([]);
  const [counts, setCounts] = useState<CountView[]>([]);
  const [countQty, setCountQty] = useState('');

  useEffect(() => {
    api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
      .then((r) => {
        setWarehouses(r.warehouses);
        const first = r.warehouses[0];
        if (first) setWarehouseId(first.id);
      })
      .catch((e: unknown) => setError(errorText(e)));
    if (can('product.read')) {
      api<{ products: Array<{ id: string }> }>('GET', '/api/v1/products/search')
        .then(async (r) => {
          const details = await Promise.all(
            r.products
              .slice(0, 20)
              .map((p) =>
                api<{ skus: Array<{ id: string; code: string; status: string }> }>(
                  'GET',
                  `/api/v1/products/${p.id}`,
                ),
              ),
          );
          const all = details.flatMap((d) => d.skus.map((s) => ({ ...s })));
          setSkus(all);
          const firstActive = all.find((s) => s.status === 'ACTIVE') ?? all[0];
          if (firstActive) setSkuId(firstActive.id);
        })
        .catch(() => undefined);
    }
  }, []);

  const refresh = useCallback(() => {
    if (!warehouseId || !skuId) {
      setPosition(null);
      setMovements([]);
      setReservations([]);
      return;
    }
    const qs = `warehouseId=${warehouseId}&skuId=${skuId}`;
    api<Position>('GET', `/api/v1/stock/position?${qs}`)
      .then((r) => {
        setPosition(r);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ movements: Movement[] }>('GET', `/api/v1/stock/movements?${qs}`)
      .then((r) => setMovements(r.movements))
      .catch(() => setMovements([]));
    api<{ reservations: Reservation[] }>('GET', `/api/v1/stock/reservations?${qs}`)
      .then((r) => setReservations(r.reservations))
      .catch(() => setReservations([]));
    api<{ lots: LotBalance[] }>('GET', `/api/v1/stock/lots?${qs}`)
      .then((r) => setLots(r.lots))
      .catch(() => setLots([]));
    if (can('inventory.count')) {
      api<{ counts: CountView[] }>('GET', '/api/v1/stock/counts')
        .then((r) => setCounts(r.counts))
        .catch(() => setCounts([]));
    }
    // eslint-disable-next-line
  }, [warehouseId, skuId]);

  useEffect(refresh, [refresh]);

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
      refresh();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const skuLabel = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  return (
    <main className="page">
      <h1>Inventory</h1>
      <p className="page-sub">
        Ledger-driven stock: every change is an immutable movement; positions are derived.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card">
        <div className="row">
          <div style={{ minWidth: 220 }}>
            <label className="label">Warehouse</label>
            <select
              className="select"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Select warehouse…</option>
              {(warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label className="label">SKU</label>
            <select className="select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
              <option value="">Select SKU…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} {s.status !== 'ACTIVE' ? `(${s.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          {position ? (
            <div className="row" style={{ gap: 24, marginLeft: 'auto' }}>
              <div>
                <div className="kpi">{position.onHand}</div>
                <div className="kpi-label">On hand</div>
              </div>
              <div>
                <div className="kpi">{position.reserved}</div>
                <div className="kpi-label">Reserved</div>
              </div>
              <div>
                <div className="kpi" style={{ color: 'var(--color-accent)' }}>
                  {position.available}
                </div>
                <div className="kpi-label">Available</div>
              </div>
            </div>
          ) : null}
        </div>
        {warehouses !== null && warehouses.length === 0 ? (
          <div className="empty">No warehouses yet — create one below.</div>
        ) : null}
        {lots.length > 0 ? (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Lots (FEFO — issues consume the earliest expiry first)
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {lots.map((l) => (
                <span
                  key={l.lotNumber}
                  className={`badge ${l.expired ? 'badge-danger' : l.expiringSoon ? 'badge-warn' : 'badge-ok'}`}
                  title={
                    l.expiresAt
                      ? `Expires ${new Date(l.expiresAt).toLocaleDateString()}`
                      : 'No expiry'
                  }
                >
                  {l.lotNumber}: {l.onHand}
                  {l.expiresAt ? ` · ${new Date(l.expiresAt).toLocaleDateString()}` : ''}
                  {l.expired ? ' · EXPIRED' : ''}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid-2">
        <div>
          {can('inventory.receive') || can('inventory.adjust') || can('inventory.pick') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/stock/movements', {
                      warehouseId,
                      skuId,
                      movementType,
                      quantity: Number(quantity),
                      idempotencyKey: randomKey(),
                      ...(reason ? { reason } : {}),
                      ...(lotNumber ? { lotNumber } : {}),
                    }),
                  'Movement posted to the ledger.',
                );
              }}
            >
              <h2>Post movement</h2>
              <label className="label">Type</label>
              <select
                className="select"
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="label">Quantity</label>
              <input
                className="input"
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <label className="label">Lot (required for lot-tracked SKUs on receipt)</label>
              <input
                className="input mono"
                placeholder="e.g. LOT-2026-091"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
              <label className="label">Reason (optional)</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy || !warehouseId || !skuId}
                type="submit"
              >
                Post movement
              </button>
            </form>
          ) : null}

          {can('inventory.pick') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/stock/reservations', {
                      warehouseId,
                      skuId,
                      quantity: Number(reserveQty),
                      ...(reference ? { reference } : {}),
                    }),
                  'Stock reserved.',
                );
              }}
            >
              <h2>Reserve stock</h2>
              <label className="label">Quantity</label>
              <input
                className="input"
                type="number"
                min="0.000001"
                step="any"
                value={reserveQty}
                onChange={(e) => setReserveQty(e.target.value)}
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
                disabled={busy || !warehouseId || !skuId}
                type="submit"
              >
                Reserve
              </button>
            </form>
          ) : null}

          {can('inventory.adjust') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => api('POST', '/api/v1/warehouses', { code: whCode, name: whName }),
                  `Warehouse ${whCode} created.`,
                ).then(() => {
                  setWhCode('');
                  setWhName('');
                  api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
                    .then((r) => setWarehouses(r.warehouses))
                    .catch(() => undefined);
                });
              }}
            >
              <h2>New warehouse</h2>
              <label className="label">Code</label>
              <input
                className="input mono"
                value={whCode}
                onChange={(e) => setWhCode(e.target.value)}
                required
              />
              <label className="label">Name</label>
              <input
                className="input"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                required
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Create warehouse
              </button>
            </form>
          ) : null}
        </div>

        <div>
          <div className="card">
            <h2>Recent movements</h2>
            {movements.length === 0 ? (
              <div className="empty">No movements for this selection.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span
                          className={`badge ${
                            m.movementType.includes('IN') || m.movementType === 'RECEIPT'
                              ? 'badge-ok'
                              : 'badge-warn'
                          }`}
                        >
                          {m.movementType}
                        </span>
                        {m.reason ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {m.reason}
                          </div>
                        ) : null}
                      </td>
                      <td>{m.quantity}</td>
                      <td className="muted">{new Date(m.occurredAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Reservations</h2>
            {reservations.length === 0 ? (
              <div className="empty">No reservations for this selection.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.id}>
                      <td>{r.quantity}</td>
                      <td>
                        <span className={`badge ${r.status === 'ACTIVE' ? 'badge-accent' : ''}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{r.reference ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.status === 'ACTIVE' && can('inventory.pick') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  api('POST', '/api/v1/stock/reservations/release', {
                                    reservationId: r.id,
                                  }),
                                'Reservation released.',
                              )
                            }
                            type="button"
                          >
                            Release
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="muted" style={{ fontSize: 12 }}>
            Selected SKU: <span className="mono">{skuId ? skuLabel(skuId) : '—'}</span>. Stock can
            never be edited directly — corrections are reversal movements.
          </p>
        </div>
      </div>
      {can('inventory.count') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="spread">
            <h2>Stock counts</h2>
            <button
              className="btn btn-sm"
              disabled={busy || !warehouseId}
              onClick={() =>
                run(
                  () => api('POST', '/api/v1/stock/counts', { warehouseId }),
                  'Stock count opened for the selected warehouse.',
                )
              }
              type="button"
            >
              New count
            </button>
          </div>
          {counts.length === 0 ? <div className="empty">No stock counts yet.</div> : null}
          {counts.map((c) => (
            <div
              key={c.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <strong className="mono">{c.countNumber}</strong>
                <span className="row" style={{ gap: 6 }}>
                  <span
                    className={`badge ${
                      c.status === 'POSTED'
                        ? 'badge-ok'
                        : c.status === 'CANCELLED'
                          ? 'badge-danger'
                          : 'badge-warn'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.status === 'OPEN' && can('inventory.adjust.approve') ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/stock/counts/${c.id}/post`),
                          'Count posted — variances adjusted in the ledger.',
                        )
                      }
                      type="button"
                    >
                      Post variances
                    </button>
                  ) : null}
                  {c.status === 'OPEN' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/stock/counts/${c.id}/cancel`),
                          'Count cancelled.',
                        )
                      }
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : null}
                </span>
              </div>
              {c.lines.length > 0 ? (
                <table className="table" style={{ marginTop: 6 }}>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="mono">{skuLabel(l.skuId)}</td>
                        <td>
                          expected {l.expectedQty} · counted {l.countedQty}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            className={`badge ${
                              Number(l.variance) === 0
                                ? 'badge-ok'
                                : Number(l.variance) > 0
                                  ? 'badge-warn'
                                  : 'badge-danger'
                            }`}
                          >
                            {Number(l.variance) > 0 ? '+' : ''}
                            {l.variance}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {c.status === 'OPEN' ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <input
                    className="input"
                    style={{ maxWidth: 130 }}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Counted qty"
                    value={countQty}
                    onChange={(e) => setCountQty(e.target.value)}
                  />
                  <button
                    className="btn btn-sm"
                    disabled={busy || !skuId || countQty === ''}
                    onClick={() =>
                      run(
                        () =>
                          api('POST', `/api/v1/stock/counts/${c.id}/lines`, {
                            skuId,
                            countedQty: Number(countQty),
                          }),
                        'Counted quantity recorded for the selected SKU.',
                      ).then(() => setCountQty(''))
                    }
                    type="button"
                  >
                    Record selected SKU
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
