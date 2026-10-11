'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import { DataTable, EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import {
  SerialInput,
  serialProblem,
  serialsApplicable,
  serialsPayload,
  useSerialPolicies,
} from '../../../components/serial-input';
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

interface SerialTrace {
  serial: string;
  inStock: boolean;
  warehouseId: string;
  movements: Array<{
    movementId: string;
    movementType: string;
    warehouseId: string;
    reason: string | null;
    occurredAt: string;
  }>;
}

const OUTBOUND_TYPES = new Set(['ISSUE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT']);

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

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Prijem',
  ISSUE: 'Izdavanje',
  ADJUSTMENT_IN: 'Korekcija ulaz',
  ADJUSTMENT_OUT: 'Korekcija izlaz',
  TRANSFER_IN: 'Prenos ulaz',
  TRANSFER_OUT: 'Prenos izlaz',
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktivna',
  RELEASED: 'Otpuštena',
  CONSUMED: 'Iskorištena',
  CANCELLED: 'Otkazana',
};

const COUNT_STATUS_LABELS: Record<CountView['status'], string> = {
  OPEN: 'Otvoren',
  POSTED: 'Proknjižen',
  CANCELLED: 'Otkazan',
};

const HOLD_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktivan',
  RELEASED: 'Otpušten',
  SCRAPPED: 'Otpisan',
};

function typeLabel(code: string, map: Record<string, string>): string {
  const label = map[code];
  return label ? `${code} · ${label}` : code;
}

function randomKey(): string {
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function InventoryPage() {
  const { can } = useApp();
  const [warehouses, setWarehouses] = useState<WarehouseView[] | null>(null);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [bins, setBins] = useState<
    Array<{ locationId: string; locationCode: string; skuId: string; onHand: string }>
  >([]);
  const [locations, setLocations] = useState<Array<{ id: string; code: string }>>([]);
  const [newBinCode, setNewBinCode] = useState('');
  const [putawayLocation, setPutawayLocation] = useState('');
  const [putawayQty, setPutawayQty] = useState('1');
  const [skuId, setSkuId] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [holds, setHolds] = useState<
    Array<{
      id: string;
      skuCode: string;
      quantity: string;
      reason: string;
      status: string;
    }>
  >([]);
  const [holdSku, setHoldSku] = useState('');
  const [holdWarehouse, setHoldWarehouse] = useState('');
  const [holdQty, setHoldQty] = useState('1');
  const [holdReason, setHoldReason] = useState('');
  const [channel, setChannel] = useState<Array<{
    skuId: string;
    code: string;
    available: number;
    onHand: number;
  }> | null>(null);
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
  const [moveSerials, setMoveSerials] = useState<string[]>([]);
  const [snSku, setSnSku] = useState('');
  const [snWarehouse, setSnWarehouse] = useState('');
  const [snList, setSnList] = useState<Array<{ serial: string; warehouseId: string }> | null>(null);
  const [snListError, setSnListError] = useState<string | null>(null);
  const [snLookup, setSnLookup] = useState('');
  const [trace, setTrace] = useState<SerialTrace | null>(null);
  const [traceBusy, setTraceBusy] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [onbWarehouse, setOnbWarehouse] = useState('');
  const [onbSku, setOnbSku] = useState('');
  const [onbSerials, setOnbSerials] = useState<string[]>([]);
  const policyOf = useSerialPolicies(skus.map((s) => s.id));
  const policiesLoading = skus.some((s) => policyOf(s.id) === 'LOADING');
  const serialSkus = skus.filter((s) => {
    const p = policyOf(s.id);
    return p === 'OPTIONAL' || p === 'REQUIRED';
  });

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

  useEffect(() => {
    if (!warehouseId) return;
    api<{ rows: typeof bins }>('GET', `/api/v1/stock/by-location?warehouseId=${warehouseId}`)
      .then((r) => setBins(r.rows))
      .catch(() => setBins([]));
    api<{ locations: Array<{ id: string; code: string }> }>(
      'GET',
      `/api/v1/warehouses/locations?warehouseId=${warehouseId}`,
    )
      .then((r) => setLocations(r.locations))
      .catch(() => setLocations([]));
    // eslint-disable-next-line
  }, [warehouseId, notice]);

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

  async function run(fn: () => Promise<unknown>, successText: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
      refresh();
      return true;
    } catch (e: unknown) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const loadSerials = useCallback(() => {
    if (!snSku) {
      setSnList(null);
      return;
    }
    setSnList(null);
    setSnListError(null);
    const qs = `skuId=${snSku}${snWarehouse ? `&warehouseId=${snWarehouse}` : ''}`;
    api<{ serials: Array<{ serial: string; warehouseId: string }> }>(
      'GET',
      `/api/v1/stock/serials?${qs}`,
    )
      .then((r) => setSnList(r.serials))
      .catch((e: unknown) => {
        setSnList([]);
        setSnListError(errorText(e));
      });
  }, [snSku, snWarehouse]);

  useEffect(loadSerials, [loadSerials]);

  function openTrace(serial: string) {
    const value = serial.trim();
    if (!snSku || !value) return;
    setTraceBusy(true);
    setTraceError(null);
    api<SerialTrace>('GET', `/api/v1/stock/serials/${snSku}/${encodeURIComponent(value)}`)
      .then((r) => setTrace(r))
      .catch((e: unknown) => {
        setTrace(null);
        setTraceError(
          e instanceof ApiRequestError && e.status === 404
            ? `Serijski broj ${value} nije evidentiran za odabrani SKU.`
            : errorText(e),
        );
      })
      .finally(() => setTraceBusy(false));
  }

  const whLabel = (id: string) => warehouses?.find((w) => w.id === id)?.code ?? id.slice(0, 8);
  const movePolicy = policyOf(skuId);
  const moveQty = Number(quantity);
  const moveSerialProblem = serialProblem(movePolicy, moveQty, moveSerials);
  const onbPolicy = policyOf(onbSku);

  const skuLabel = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  return (
    <main className="page">
      <div className="spread">
        <h1>Skladište i zalihe</h1>
        <Link className="btn btn-sm" href="/flow">
          Vođeni tok robe →
        </Link>
      </div>
      <p className="page-sub">
        Zalihe vođene knjigom kretanja: svaka promjena je nepromjenjivo kretanje; stanja se izvode
        iz knjige.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {warehouses === null && !error ? <LoadingState text="Učitavanje skladišta…" /> : null}

      <div className="card">
        <div className="row">
          <div style={{ minWidth: 220 }}>
            <label className="label">Skladište</label>
            <select
              className="select"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Odaberi skladište…</option>
              {(warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label className="label">SKU</label>
            <select
              className="select"
              value={skuId}
              onChange={(e) => {
                setSkuId(e.target.value);
                setMoveSerials([]);
              }}
            >
              <option value="">Odaberi SKU…</option>
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
                <div className="kpi-label">Na stanju</div>
              </div>
              <div>
                <div className="kpi">{position.reserved}</div>
                <div className="kpi-label">Rezervisano</div>
              </div>
              <div>
                <div className="kpi" style={{ color: 'var(--color-accent)' }}>
                  {position.available}
                </div>
                <div className="kpi-label">Dostupno</div>
              </div>
            </div>
          ) : null}
        </div>
        {warehouses !== null && warehouses.length === 0 ? (
          <EmptyState text="Još nema skladišta — kreiraj jedno ispod." />
        ) : null}
        {lots.length > 0 ? (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Lotovi (FEFO — izdavanja prvo troše najraniji rok trajanja)
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {lots.map((l) => (
                <span
                  key={l.lotNumber}
                  className={`badge ${l.expired ? 'badge-danger' : l.expiringSoon ? 'badge-warn' : 'badge-ok'}`}
                  title={
                    l.expiresAt
                      ? `Ističe ${new Date(l.expiresAt).toLocaleDateString()}`
                      : 'Bez roka trajanja'
                  }
                >
                  {l.lotNumber}: {l.onHand}
                  {l.expiresAt ? ` · ${new Date(l.expiresAt).toLocaleDateString()}` : ''}
                  {l.expired ? ' · ISTEKAO' : ''}
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
                if (moveSerialProblem) return;
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
                      ...serialsPayload(movePolicy, moveSerials),
                    }),
                  'Kretanje proknjiženo u knjigu zaliha.',
                ).then((ok) => {
                  if (!ok) return;
                  setMoveSerials([]);
                  if (snSku === skuId) loadSerials();
                });
              }}
            >
              <h2>Knjiži kretanje</h2>
              <label className="label">Tip</label>
              <select
                className="select"
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t, MOVEMENT_TYPE_LABELS)}
                  </option>
                ))}
              </select>
              <label className="label">Količina</label>
              <input
                className="input"
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <label className="label">Lot (obavezan pri prijemu lot-praćenih SKU-ova)</label>
              <input
                className="input mono"
                placeholder="npr. LOT-2026-091"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
              {serialsApplicable(movePolicy) ? (
                <SerialInput
                  value={moveSerials}
                  onChange={setMoveSerials}
                  policy={movePolicy}
                  quantity={moveQty}
                  disabled={busy}
                  hint={
                    OUTBOUND_TYPES.has(movementType)
                      ? 'Izlaz: svaki serijski broj mora biti na zalihi u odabranom skladištu.'
                      : 'Ulaz: serijski broj ne smije već biti na zalihi ni u jednom skladištu.'
                  }
                />
              ) : null}
              <label className="label">Razlog (opciono)</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              {moveSerialProblem ? (
                <div className="alert alert-error" role="alert">
                  {moveSerialProblem}
                </div>
              ) : null}
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy || !warehouseId || !skuId || moveSerialProblem !== null}
                type="submit"
              >
                Proknjiži kretanje
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
                  'Zalihe rezervisane.',
                );
              }}
            >
              <h2>Rezerviši zalihe</h2>
              <label className="label">Količina</label>
              <input
                className="input"
                type="number"
                min="0.000001"
                step="any"
                value={reserveQty}
                onChange={(e) => setReserveQty(e.target.value)}
                required
              />
              <label className="label">Referenca (opciono)</label>
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
                Rezerviši
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
                  `Skladište ${whCode} kreirano.`,
                ).then(() => {
                  setWhCode('');
                  setWhName('');
                  api<{ warehouses: WarehouseView[] }>('GET', '/api/v1/warehouses')
                    .then((r) => setWarehouses(r.warehouses))
                    .catch(() => undefined);
                });
              }}
            >
              <h2>Novo skladište</h2>
              <label className="label">Šifra</label>
              <input
                className="input mono"
                value={whCode}
                onChange={(e) => setWhCode(e.target.value)}
                required
              />
              <label className="label">Naziv</label>
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
                Kreiraj skladište
              </button>
            </form>
          ) : null}
        </div>

        <div>
          <div className="card">
            <h2>Nedavna kretanja</h2>
            <DataTable
              columns={[
                {
                  key: 'type',
                  header: 'Tip',
                  render: (m: Movement) => (
                    <>
                      <span
                        className={`badge ${
                          m.movementType.includes('IN') || m.movementType === 'RECEIPT'
                            ? 'badge-ok'
                            : 'badge-warn'
                        }`}
                      >
                        {typeLabel(m.movementType, MOVEMENT_TYPE_LABELS)}
                      </span>
                      {m.reason ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {m.reason}
                        </div>
                      ) : null}
                    </>
                  ),
                  text: (m: Movement) =>
                    `${typeLabel(m.movementType, MOVEMENT_TYPE_LABELS)} ${m.reason ?? ''}`,
                },
                {
                  key: 'qty',
                  header: 'Količina',
                  render: (m: Movement) => m.quantity,
                  text: (m: Movement) => m.quantity,
                  align: 'right',
                },
                {
                  key: 'when',
                  header: 'Vrijeme',
                  render: (m: Movement) => (
                    <span className="muted">{new Date(m.occurredAt).toLocaleString()}</span>
                  ),
                  text: (m: Movement) => new Date(m.occurredAt).toLocaleString(),
                },
              ]}
              rows={movements}
              rowKey={(m) => m.id}
              searchPlaceholder="Pretraži kretanja…"
              pageSize={10}
              emptyText="Nema kretanja za odabrano skladište i SKU."
            />
          </div>

          <div className="card">
            <h2>Rezervacije</h2>
            <DataTable
              columns={[
                {
                  key: 'qty',
                  header: 'Količina',
                  render: (r: Reservation) => r.quantity,
                  text: (r: Reservation) => r.quantity,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r: Reservation) => (
                    <span className={`badge ${r.status === 'ACTIVE' ? 'badge-accent' : ''}`}>
                      {typeLabel(r.status, RESERVATION_STATUS_LABELS)}
                    </span>
                  ),
                  text: (r: Reservation) => typeLabel(r.status, RESERVATION_STATUS_LABELS),
                },
                {
                  key: 'reference',
                  header: 'Referenca',
                  render: (r: Reservation) => r.reference ?? '—',
                  text: (r: Reservation) => r.reference ?? '',
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (r: Reservation) =>
                    r.status === 'ACTIVE' && can('inventory.pick') ? (
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api('POST', '/api/v1/stock/reservations/release', {
                                reservationId: r.id,
                              }),
                            'Rezervacija otpuštena.',
                          )
                        }
                        type="button"
                      >
                        Otpusti
                      </button>
                    ) : null,
                },
              ]}
              rows={reservations}
              rowKey={(r) => r.id}
              searchPlaceholder="Pretraži rezervacije…"
              pageSize={10}
              emptyText="Nema rezervacija za odabrano skladište i SKU."
            />
          </div>

          <p className="muted" style={{ fontSize: 12 }}>
            Odabrani SKU: <span className="mono">{skuId ? skuLabel(skuId) : '—'}</span>. Zalihe se
            nikada ne uređuju direktno — korekcije se rade storno kretanjima.
          </p>
        </div>
      </div>
      {can('inventory.count') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="spread">
            <h2>Popisi zaliha</h2>
            <button
              className="btn btn-sm"
              disabled={busy || !warehouseId}
              onClick={() =>
                run(
                  () => api('POST', '/api/v1/stock/counts', { warehouseId }),
                  'Popis otvoren za odabrano skladište.',
                )
              }
              type="button"
            >
              Novi popis
            </button>
          </div>
          {counts.length === 0 ? <EmptyState text="Još nema popisa zaliha." /> : null}
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
                    {typeLabel(c.status, COUNT_STATUS_LABELS)}
                  </span>
                  {c.status === 'OPEN' && can('inventory.adjust.approve') ? (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/stock/counts/${c.id}/post`),
                          'Popis proknjižen — razlike korigovane u knjizi zaliha.',
                        )
                      }
                      type="button"
                    >
                      Proknjiži razlike
                    </button>
                  ) : null}
                  {c.status === 'OPEN' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/stock/counts/${c.id}/cancel`),
                          'Popis otkazan.',
                        )
                      }
                      type="button"
                    >
                      Otkaži
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
                          očekivano {l.expectedQty} · popisano {l.countedQty}
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
                    placeholder="Popisana količina"
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
                        'Popisana količina zabilježena za odabrani SKU.',
                      ).then(() => setCountQty(''))
                    }
                    type="button"
                  >
                    Zabilježi odabrani SKU
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {can('inventory.read') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="spread">
            <h2>Karantin</h2>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                api<{ holds: typeof holds }>('GET', '/api/v1/quarantine')
                  .then((r) => setHolds(r.holds))
                  .catch(() => setHolds([]));
              }}
            >
              Učitaj zadržavanja
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Zadržane količine ne mogu se rezervisati dok ih kontrola kvaliteta ne otpusti ili
            otpiše.
          </p>
          {holds.map((h) => (
            <div key={h.id} className="row spread" style={{ marginBottom: 6 }}>
              <span>
                <strong className="mono">{h.skuCode}</strong> × {h.quantity}{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {h.reason}
                </span>
              </span>
              <span>
                <span
                  className={`badge ${
                    h.status === 'ACTIVE' ? 'badge-warn' : h.status === 'RELEASED' ? 'badge-ok' : ''
                  }`}
                >
                  {typeLabel(h.status, HOLD_STATUS_LABELS)}
                </span>{' '}
                {h.status === 'ACTIVE' && can('qc.approve') ? (
                  <>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        run(async () => {
                          await api('POST', `/api/v1/quarantine/${h.id}/decide`, {
                            decision: 'RELEASE',
                          });
                          const r = await api<{ holds: typeof holds }>('GET', '/api/v1/quarantine');
                          setHolds(r.holds);
                        }, 'Zadržavanje otpušteno.')
                      }
                    >
                      Otpusti
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        run(async () => {
                          await api('POST', `/api/v1/quarantine/${h.id}/decide`, {
                            decision: 'SCRAP',
                          });
                          const r = await api<{ holds: typeof holds }>('GET', '/api/v1/quarantine');
                          setHolds(r.holds);
                        }, 'Zadržavanje otpisano — zalihe korigovane.')
                      }
                    >
                      Otpiši
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ))}
          {can('inventory.adjust') ? (
            <form
              className="row"
              style={{ marginTop: 10, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/quarantine', {
                    warehouseId: holdWarehouse,
                    skuId: holdSku,
                    quantity: Number(holdQty),
                    reason: holdReason,
                  });
                  setHoldReason('');
                  const r = await api<{ holds: typeof holds }>('GET', '/api/v1/quarantine');
                  setHolds(r.holds);
                }, 'Karantinsko zadržavanje postavljeno.');
              }}
            >
              <select
                className="select"
                style={{ maxWidth: 150 }}
                value={holdWarehouse}
                onChange={(e) => setHoldWarehouse(e.target.value)}
                required
              >
                <option value="">Skladište…</option>
                {(warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code}
                  </option>
                ))}
              </select>
              <select
                className="select"
                style={{ maxWidth: 150 }}
                value={holdSku}
                onChange={(e) => setHoldSku(e.target.value)}
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
                style={{ maxWidth: 80 }}
                type="number"
                min="0.000001"
                step="any"
                value={holdQty}
                onChange={(e) => setHoldQty(e.target.value)}
              />
              <input
                className="input"
                style={{ maxWidth: 200 }}
                placeholder="Razlog"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                required
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Postavi zadržavanje
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {can('inventory.read') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Serijski brojevi</h2>
          <p className="muted">
            Gdje je svaka serijski praćena jedinica i kroz koja je kretanja prošla. Skeniraj
            serijski broj za trag ili klikni jedinicu sa zalihe.
          </p>
          {policiesLoading && serialSkus.length === 0 ? (
            <LoadingState text="Učitavanje politika serijskih brojeva…" />
          ) : null}
          {!policiesLoading && serialSkus.length === 0 ? (
            <EmptyState text="Nijedan SKU nije serijski praćen — politika se postavlja u katalogu." />
          ) : null}
          {serialSkus.length > 0 ? (
            <>
              <div className="row">
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <label className="label">SKU (serijski praćen)</label>
                  <select
                    className="select"
                    value={snSku}
                    onChange={(e) => {
                      setSnSku(e.target.value);
                      setTrace(null);
                      setTraceError(null);
                    }}
                  >
                    <option value="">Odaberi SKU…</option>
                    {serialSkus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {policyOf(s.id) === 'REQUIRED' ? 'obavezno' : 'opciono'}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <label className="label">Skladište</label>
                  <select
                    className="select"
                    value={snWarehouse}
                    onChange={(e) => setSnWarehouse(e.target.value)}
                  >
                    <option value="">Sva skladišta</option>
                    {(warehouses ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {snSku ? (
                <form
                  className="row"
                  style={{ flexWrap: 'nowrap', marginTop: 10 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    openTrace(snLookup);
                  }}
                >
                  <input
                    className="input mono"
                    style={{ minWidth: 0 }}
                    placeholder="Skeniraj serijski broj za trag"
                    aria-label="Serijski broj za trag"
                    autoComplete="off"
                    spellCheck={false}
                    value={snLookup}
                    onChange={(e) => setSnLookup(e.target.value)}
                  />
                  <button
                    className="btn btn-sm"
                    type="submit"
                    disabled={traceBusy || !snLookup.trim()}
                  >
                    Prikaži trag
                  </button>
                </form>
              ) : null}
              {snSku ? (
                <div style={{ marginTop: 12 }}>
                  {snListError ? <ErrorState text={snListError} /> : null}
                  {snList === null && !snListError ? (
                    <LoadingState text="Učitavanje serijskih brojeva…" />
                  ) : null}
                  {snList !== null && !snListError ? (
                    <DataTable
                      columns={[
                        {
                          key: 'serial',
                          header: 'Serijski broj',
                          render: (r) => <span className="mono">{r.serial}</span>,
                          text: (r) => r.serial,
                        },
                        {
                          key: 'wh',
                          header: 'Skladište',
                          render: (r) => whLabel(r.warehouseId),
                          text: (r) => whLabel(r.warehouseId),
                        },
                      ]}
                      rows={snList}
                      rowKey={(r) => r.serial}
                      onRowClick={(r) => {
                        setSnLookup(r.serial);
                        openTrace(r.serial);
                      }}
                      searchPlaceholder="Traži serijski broj…"
                      emptyText="Nema serijskih brojeva na zalihi za odabrani filter."
                    />
                  ) : null}
                </div>
              ) : null}
              {traceBusy ? <LoadingState text="Učitavanje traga…" /> : null}
              {traceError ? <ErrorState text={traceError} /> : null}
              {trace && !traceBusy ? (
                <div
                  style={{
                    marginTop: 12,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 10,
                  }}
                >
                  <div className="spread" style={{ flexWrap: 'wrap' }}>
                    <strong className="mono" style={{ overflowWrap: 'anywhere' }}>
                      {trace.serial}
                    </strong>
                    <span className={`badge ${trace.inStock ? 'badge-ok' : ''}`}>
                      {trace.inStock
                        ? `Na zalihi · ${whLabel(trace.warehouseId)}`
                        : 'Nije na zalihi'}
                    </span>
                  </div>
                  {trace.movements.length === 0 ? (
                    <EmptyState text="Serijski broj je evidentiran bez kretanja (npr. evidentiran za postojeću zalihu)." />
                  ) : (
                    <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
                      {trace.movements.map((m) => (
                        <li
                          key={m.movementId}
                          style={{
                            borderLeft: `2px solid ${OUTBOUND_TYPES.has(m.movementType) ? 'var(--color-warn)' : 'var(--color-accent)'}`,
                            padding: '4px 0 8px 12px',
                          }}
                        >
                          <div className="spread" style={{ flexWrap: 'wrap' }}>
                            <strong>{typeLabel(m.movementType, MOVEMENT_TYPE_LABELS)}</strong>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {new Date(m.occurredAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="muted" style={{ fontSize: 12.5 }}>
                            {whLabel(m.warehouseId)}
                            {m.reason ? ` · ${m.reason}` : ''}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}

              {can('inventory.adjust') ? (
                <form
                  style={{
                    marginTop: 16,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 10,
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!onbWarehouse || !onbSku || onbSerials.length === 0) return;
                    const out: { r?: { onboarded: number; untrackedLeft: number } } = {};
                    void run(async () => {
                      out.r = await api<{ onboarded: number; untrackedLeft: number }>(
                        'POST',
                        '/api/v1/stock/serials/onboard',
                        { warehouseId: onbWarehouse, skuId: onbSku, serials: onbSerials },
                      );
                    }, 'Serijski brojevi evidentirani za postojeću zalihu.').then((ok) => {
                      if (!ok || !out.r) return;
                      setOnbSerials([]);
                      setNotice(
                        `Evidentirano serijskih brojeva: ${out.r.onboarded}. Preostalo zalihe bez serijskog broja u skladištu: ${out.r.untrackedLeft}.`,
                      );
                      if (onbSku === snSku) loadSerials();
                    });
                  }}
                >
                  <h3 style={{ margin: '4px 0' }}>
                    Evidentiraj serijske brojeve za postojeću zalihu
                  </h3>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Za zalihu primljenu prije uvođenja serijskog praćenja. Ne knjiži kretanje i ne
                    mijenja količinu — broj serijskih brojeva ograničen je na stanje u skladištu
                    koje još nema serijski broj.
                  </p>
                  <div className="row">
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <label className="label">Skladište</label>
                      <select
                        className="select"
                        value={onbWarehouse}
                        onChange={(e) => setOnbWarehouse(e.target.value)}
                        required
                      >
                        <option value="">Odaberi skladište…</option>
                        {(warehouses ?? []).map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <label className="label">SKU</label>
                      <select
                        className="select"
                        value={onbSku}
                        onChange={(e) => {
                          setOnbSku(e.target.value);
                          setOnbSerials([]);
                        }}
                        required
                      >
                        <option value="">Odaberi SKU…</option>
                        {serialSkus.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {onbSku ? (
                    <SerialInput
                      value={onbSerials}
                      onChange={setOnbSerials}
                      policy={onbPolicy}
                      quantity={NaN}
                      disabled={busy}
                    />
                  ) : null}
                  {!onbWarehouse || !onbSku || onbSerials.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Odaberi skladište i SKU, pa skeniraj barem jedan serijski broj.
                    </div>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 10 }}
                    type="submit"
                    disabled={busy || !onbWarehouse || !onbSku || onbSerials.length === 0}
                  >
                    Evidentiraj ({onbSerials.length})
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {can('inventory.read') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="spread">
            <h2>Dostupnost po kanalima</h2>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                api<{ availability: NonNullable<typeof channel> }>(
                  'GET',
                  '/api/v1/stock/channel-availability',
                )
                  .then((r) => setChannel(r.availability))
                  .catch(() => setChannel([]));
              }}
            >
              Osvježi feed
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Feed prodajnih količina koji koriste web-prodavnice i marketplace-i (dostupan i API
            ključevima na <span className="mono">/api/v1/stock/channel-availability</span>).
          </p>
          {channel === null ? null : channel.length === 0 ? (
            <EmptyState text="Nema aktivnih SKU-ova." />
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {channel.slice(0, 24).map((row) => (
                <span key={row.skuId} className="badge mono" title={`na stanju ${row.onHand}`}>
                  {row.code}: {row.available}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {warehouseId && can('inventory.read') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Bin lokacije i odlaganje</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Zalihe po binu izvode se uživo iz kretanja u knjizi označenih lokacijom.
          </p>
          {bins.length === 0 ? <EmptyState text="Još ništa nije odloženo u binove." /> : null}
          {bins.slice(0, 20).map((b) => (
            <div
              key={`${b.locationId}-${b.skuId}`}
              className="row spread"
              style={{ marginBottom: 4 }}
            >
              <span className="mono" style={{ fontSize: 13 }}>
                {b.locationCode}
              </span>
              <span className="mono" style={{ fontSize: 13 }}>
                {skus.find((k) => k.id === b.skuId)?.code ?? b.skuId.slice(0, 8)} · {b.onHand}
              </span>
            </div>
          ))}
          {can('inventory.adjust') ? (
            <>
              <form
                className="row"
                style={{ marginTop: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/warehouses/locations', {
                        warehouseId,
                        code: newBinCode,
                      }),
                    `Bin ${newBinCode} kreiran.`,
                  ).then(() => setNewBinCode(''));
                }}
              >
                <input
                  className="input mono"
                  style={{ width: 140 }}
                  placeholder="Šifra novog bina"
                  value={newBinCode}
                  onChange={(e) => setNewBinCode(e.target.value)}
                  required
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Dodaj bin
                </button>
              </form>
              {locations.length > 0 && skuId ? (
                <form
                  className="row"
                  style={{ marginTop: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        api('POST', '/api/v1/stock/putaway', {
                          warehouseId,
                          skuId,
                          quantity: Number(putawayQty),
                          toLocationId: putawayLocation,
                          putawayKey: `ui-${Date.now()}`,
                        }),
                      'Zalihe odložene u bin.',
                    );
                  }}
                >
                  <select
                    className="input"
                    value={putawayLocation}
                    onChange={(e) => setPutawayLocation(e.target.value)}
                    required
                  >
                    <option value="">Bin…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    style={{ width: 80 }}
                    value={putawayQty}
                    onChange={(e) => setPutawayQty(e.target.value)}
                    required
                  />
                  <button className="btn btn-sm" disabled={busy} type="submit">
                    Odloži
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
