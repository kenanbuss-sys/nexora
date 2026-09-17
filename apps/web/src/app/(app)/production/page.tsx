'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, DataTable, EmptyState, LoadingState } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { downloadDocument } from '../../../lib/download';
import { useApp } from '../app-shell';

interface WoOperationView {
  id: string;
  seq: number;
  name: string;
  workCenter: string;
  status: 'PENDING' | 'RUNNING' | 'DONE';
}

interface WorkCenterOption {
  id: string;
  code: string;
  name: string;
}

interface OeeInputRow {
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  downtimeMinutes: number;
  downtimeByCategory: Record<string, number>;
  operationsCompleted: number;
  avgOperationMinutes: string | null;
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

const WO_LABEL: Record<WorkOrderView['status'], string> = {
  PLANNED: 'Planiran',
  RELEASED: 'Pušten u rad',
  IN_PROGRESS: 'U toku',
  PAUSED: 'Pauziran',
  COMPLETED: 'Završen',
  CANCELLED: 'Otkazan',
};

const OP_LABEL: Record<WoOperationView['status'], string> = {
  PENDING: 'Na čekanju',
  RUNNING: 'U toku',
  DONE: 'Završena',
};

const DT_CATEGORY_LABEL: Record<string, string> = {
  BREAKDOWN: 'Kvar',
  SETUP: 'Podešavanje',
  MATERIAL: 'Materijal',
  QUALITY: 'Kvalitet',
  OTHER: 'Ostalo',
};

type ConfirmKind = 'release' | 'start' | 'pause' | 'complete' | 'cancel';

export default function ProductionPage() {
  const { can } = useApp();
  const [workOrders, setWorkOrders] = useState<WorkOrderView[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backflush, setBackflush] = useState(false);
  const [wcLoad, setWcLoad] = useState<
    Array<{ code: string; name: string; active: boolean; pending: number; running: number }>
  >([]);
  const [byDay, setByDay] = useState<
    Array<{ day: string; good: number; scrap: number; workOrders: number }>
  >([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([]);
  const [oee, setOee] = useState<OeeInputRow[]>([]);
  const [dtCenter, setDtCenter] = useState('');
  const [dtCategory, setDtCategory] = useState('BREAKDOWN');
  const [dtMinutes, setDtMinutes] = useState('15');
  const [dtReason, setDtReason] = useState('');
  const [wcCode, setWcCode] = useState('');
  const [wcName, setWcName] = useState('');

  const [newSku, setNewSku] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newQty, setNewQty] = useState('10');
  const [completeWo, setCompleteWo] = useState('');
  const [goodQty, setGoodQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');

  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; wo: WorkOrderView } | null>(null);

  const load = useCallback(() => {
    api<{ workCenters: WorkCenterOption[] }>('GET', '/api/v1/shopfloor/work-centers')
      .then((r) => setWorkCenters(r.workCenters))
      .catch(() => setWorkCenters([]));
    api<{ rows: OeeInputRow[] }>('GET', '/api/v1/shopfloor/oee?days=30')
      .then((r) => setOee(r.rows))
      .catch(() => setOee([]));
    api<{ workOrders: WorkOrderView[] }>('GET', '/api/v1/work-orders')
      .then((r) => {
        setWorkOrders(r.workOrders);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    api<{ rows: typeof byDay }>('GET', '/api/v1/work-orders/production-by-day')
      .then((r) => setByDay(r.rows))
      .catch(() => setByDay([]));
    api<{ load: typeof wcLoad }>('GET', '/api/v1/work-orders/work-center-load')
      .then((r) => setWcLoad(r.load))
      .catch(() => setWcLoad([]));
    api<{ config: { mes?: { issueMode?: string } } }>('GET', '/api/v1/tenant/configuration')
      .then((r) => setBackflush(r.config?.mes?.issueMode === 'backflush'))
      .catch(() => setBackflush(false));
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

  const filteredOrders = (workOrders ?? []).filter(
    (w) => !statusFilter || w.status === statusFilter,
  );
  const selected = (workOrders ?? []).find((w) => w.id === selectedId) ?? null;

  const facts = (wo: WorkOrderView) => (
    <>
      <div className="fact">
        <span>Radni nalog</span>
        <span className="mono">{wo.woNumber}</span>
      </div>
      <div className="fact">
        <span>Artikal (SKU)</span>
        <span className="mono">{skuCode(wo.skuId)}</span>
      </div>
      <div className="fact">
        <span>Planirana količina</span>
        <span>{wo.quantity}</span>
      </div>
    </>
  );

  return (
    <main className="page">
      <div className="spread">
        <h1>Proizvodnja</h1>
        <Link href="/inventory" className="btn">
          Zalihe →
        </Link>
      </div>
      <p className="page-sub">
        Radni nalozi po odobrenim normativima (BOM) — materijal se izdaje iz knjige zaliha pri
        puštanju u rad, dobra količina se prima nazad pri završetku, škart se evidentira. {wip} u
        toku (WIP).
        {backflush ? <span className="badge badge-accent"> Backflush</span> : null}
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
                  'Radni nalog je planiran.',
                );
              }}
            >
              <h2>Novi radni nalog</h2>
              <label className="label">Izlazni artikal (SKU, treba odobren normativ)</label>
              <select
                className="select"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                required
              >
                <option value="">Odaberite SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
              <label className="label">Skladište</label>
              <select
                className="select"
                value={newWarehouse}
                onChange={(e) => setNewWarehouse(e.target.value)}
                required
              >
                <option value="">Odaberite…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
              <label className="label">Količina</label>
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
                Planiraj radni nalog
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Radni nalozi</h2>
          {workOrders === null ? <LoadingState /> : null}
          {workOrders !== null ? (
            <DataTable
              columns={[
                {
                  key: 'num',
                  header: 'Broj',
                  render: (wo: WorkOrderView) => <span className="mono">{wo.woNumber}</span>,
                  text: (wo: WorkOrderView) => wo.woNumber,
                },
                {
                  key: 'sku',
                  header: 'Artikal',
                  render: (wo: WorkOrderView) => <span className="mono">{skuCode(wo.skuId)}</span>,
                  text: (wo: WorkOrderView) => skuCode(wo.skuId),
                },
                {
                  key: 'planned',
                  header: 'Planirano',
                  align: 'right',
                  render: (wo: WorkOrderView) => wo.quantity,
                },
                {
                  key: 'actual',
                  header: 'Dobro / škart',
                  align: 'right',
                  render: (wo: WorkOrderView) =>
                    wo.status === 'COMPLETED' ? (
                      <span>
                        {wo.goodQuantity} / {wo.scrapQuantity}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (wo: WorkOrderView) => (
                    <span className={`badge ${WO_BADGE[wo.status]}`}>{WO_LABEL[wo.status]}</span>
                  ),
                  text: (wo: WorkOrderView) => WO_LABEL[wo.status],
                },
              ]}
              rows={filteredOrders}
              rowKey={(wo) => wo.id}
              onRowClick={(wo) => setSelectedId(wo.id === selectedId ? null : wo.id)}
              searchPlaceholder="Pretraga naloga…"
              pageSize={10}
              emptyText={
                statusFilter
                  ? 'Nema radnih naloga za odabrani status.'
                  : 'Još nema radnih naloga — planirajte prvi iz odobrenog normativa.'
              }
              toolbar={
                <select
                  className="select"
                  style={{ maxWidth: 180 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter po statusu"
                >
                  <option value="">Svi statusi</option>
                  {(Object.keys(WO_LABEL) as Array<WorkOrderView['status']>).map((s) => (
                    <option key={s} value={s}>
                      {WO_LABEL[s]}
                    </option>
                  ))}
                </select>
              }
            />
          ) : null}

          {selected ? (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
              }}
            >
              <div className="spread">
                <div>
                  <strong className="mono">{selected.woNumber}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {skuCode(selected.skuId)} · planirano {selected.quantity}
                    {selected.status === 'COMPLETED'
                      ? ` · dobro ${selected.goodQuantity} / škart ${selected.scrapQuantity}`
                      : ''}
                  </div>
                </div>
                <span className={`badge ${WO_BADGE[selected.status]}`}>
                  {WO_LABEL[selected.status]}
                </span>
              </div>

              {selected.operations.length > 0 ? (
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {selected.operations.map((op) => (
                      <tr key={op.id}>
                        <td className="mono">{op.seq}</td>
                        <td>
                          {op.name} <span className="muted">@ {op.workCenter}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {op.status === 'DONE' ? (
                            <span className="badge badge-ok">{OP_LABEL.DONE}</span>
                          ) : selected.status === 'IN_PROGRESS' && can('production.execute') ? (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api(
                                      'POST',
                                      `/api/v1/work-orders/${selected.id}/operations/${op.id}/complete`,
                                    ),
                                  null,
                                )
                              }
                              type="button"
                            >
                              Završi operaciju
                            </button>
                          ) : (
                            <span className="badge badge-warn">{OP_LABEL[op.status]}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void downloadDocument(`/api/v1/documents/work-order/${selected.id}/label`)
                  }
                >
                  Etiketa
                </button>
                {selected.status === 'COMPLETED' &&
                Number(selected.scrapQuantity) > 0 &&
                can('production.manage') ? (
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api('POST', `/api/v1/work-orders/${selected.id}/rework`),
                        'Kreiran je nalog dorade za škartiranu količinu.',
                      )
                    }
                    type="button"
                  >
                    Dorada škarta
                  </button>
                ) : null}
                {selected.status === 'PLANNED' && can('production.manage') ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'release', wo: selected })}
                    type="button"
                  >
                    Pusti u rad
                  </button>
                ) : null}
                {['RELEASED', 'PAUSED'].includes(selected.status) && can('production.execute') ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'start', wo: selected })}
                    type="button"
                  >
                    {selected.status === 'PAUSED' ? 'Nastavi' : 'Pokreni'}
                  </button>
                ) : null}
                {selected.status === 'IN_PROGRESS' && can('production.execute') ? (
                  <>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'pause', wo: selected })}
                      type="button"
                    >
                      Pauziraj
                    </button>
                    {completeWo === selected.id ? (
                      <>
                        <input
                          className="input"
                          style={{ maxWidth: 80 }}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Dobro"
                          aria-label="Dobra količina"
                          value={goodQty}
                          onChange={(e) => setGoodQty(e.target.value)}
                        />
                        <input
                          className="input"
                          style={{ maxWidth: 80 }}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Škart"
                          aria-label="Škart količina"
                          value={scrapQty}
                          onChange={(e) => setScrapQty(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy || goodQty === ''}
                          onClick={() => setConfirm({ kind: 'complete', wo: selected })}
                          type="button"
                        >
                          Završi nalog
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setCompleteWo(selected.id);
                          setGoodQty(selected.quantity);
                          setScrapQty('0');
                        }}
                        type="button"
                      >
                        Završi…
                      </button>
                    )}
                  </>
                ) : null}
                {['PLANNED', 'RELEASED'].includes(selected.status) && can('production.manage') ? (
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'cancel', wo: selected })}
                    type="button"
                  >
                    Otkaži
                  </button>
                ) : null}
              </div>
            </div>
          ) : workOrders !== null && workOrders.length > 0 ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Kliknite na red za detalje i akcije naloga.
            </p>
          ) : null}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Radni centri i zastoji</h2>
        {oee.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Radni centar</th>
                <th>Zastoj (30 d)</th>
                <th>Glavni uzrok</th>
                <th>Završene op.</th>
                <th>Prosj. trajanje op.</th>
              </tr>
            </thead>
            <tbody>
              {oee.map((row) => {
                const top = Object.entries(row.downtimeByCategory).sort((a, z) => z[1] - a[1])[0];
                return (
                  <tr key={row.workCenterId}>
                    <td>
                      <span className="mono">{row.workCenterCode}</span> {row.workCenterName}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`badge ${
                          row.downtimeMinutes === 0
                            ? 'badge-ok'
                            : row.downtimeMinutes < 120
                              ? 'badge-warn'
                              : 'badge-danger'
                        }`}
                      >
                        {row.downtimeMinutes} min
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }} className="muted">
                      {top ? `${DT_CATEGORY_LABEL[top[0]] ?? top[0]} (${top[1]} min)` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.operationsCompleted}</td>
                    <td style={{ textAlign: 'center' }} className="mono">
                      {row.avgOperationMinutes !== null ? `${row.avgOperationMinutes} min` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState text="Još nema radnih centara — kreirajte prvi ispod." />
        )}

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {can('production.manage') ? (
            <>
              <input
                className="input mono"
                style={{ maxWidth: 100 }}
                placeholder="Šifra"
                value={wcCode}
                onChange={(e) => setWcCode(e.target.value)}
              />
              <input
                className="input"
                style={{ maxWidth: 170 }}
                placeholder="Naziv radnog centra"
                value={wcName}
                onChange={(e) => setWcName(e.target.value)}
              />
              <button
                className="btn btn-sm"
                disabled={busy || !wcCode || !wcName}
                onClick={() =>
                  run(
                    () =>
                      api('POST', '/api/v1/shopfloor/work-centers', {
                        code: wcCode,
                        name: wcName,
                      }),
                    'Radni centar je kreiran.',
                  ).then(() => {
                    setWcCode('');
                    setWcName('');
                  })
                }
                type="button"
              >
                Dodaj radni centar
              </button>
            </>
          ) : null}
          {can('production.execute') && workCenters.length > 0 ? (
            <>
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={dtCenter}
                onChange={(e) => setDtCenter(e.target.value)}
              >
                <option value="">Radni centar…</option>
                {workCenters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code}
                  </option>
                ))}
              </select>
              <select
                className="select"
                style={{ maxWidth: 140 }}
                value={dtCategory}
                onChange={(e) => setDtCategory(e.target.value)}
              >
                {['BREAKDOWN', 'SETUP', 'MATERIAL', 'QUALITY', 'OTHER'].map((c) => (
                  <option key={c} value={c}>
                    {DT_CATEGORY_LABEL[c] ?? c}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ maxWidth: 80 }}
                type="number"
                min="1"
                max="1440"
                title="Minute"
                value={dtMinutes}
                onChange={(e) => setDtMinutes(e.target.value)}
              />
              <input
                className="input"
                style={{ maxWidth: 200 }}
                placeholder="Razlog zastoja"
                value={dtReason}
                onChange={(e) => setDtReason(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                disabled={busy || !dtCenter || !dtReason.trim() || !dtMinutes}
                onClick={() =>
                  run(
                    () =>
                      api('POST', '/api/v1/shopfloor/downtime', {
                        workCenterId: dtCenter,
                        category: dtCategory,
                        minutes: Number(dtMinutes),
                        reason: dtReason,
                      }),
                    'Zastoj je evidentiran.',
                  ).then(() => setDtReason(''))
                }
                type="button"
              >
                Evidentiraj zastoj
              </button>
            </>
          ) : null}
        </div>
      </div>
      {wcLoad.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Opterećenje radnih centara</h2>
          {wcLoad.map((w) => (
            <div key={w.code} className="row spread" style={{ marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 13 }}>
                {w.code} <span className="muted">{w.name}</span>
                {!w.active ? <span className="badge badge-danger"> neaktivan</span> : null}
              </span>
              <span>
                <span className={`badge ${w.pending > 0 ? 'badge-warn' : ''}`}>
                  {w.pending} na čekanju
                </span>{' '}
                <span className={`badge ${w.running > 0 ? 'badge-accent' : ''}`}>
                  {w.running} u toku
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {byDay.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Proizvodnja po danima</h2>
          {byDay.map((d) => (
            <div key={d.day} className="row spread" style={{ marginBottom: 4 }}>
              <span className="mono">{d.day}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                dobro {d.good} · škart {d.scrap} · {d.workOrders} naloga
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {confirm?.kind === 'release' ? (
        <ConfirmDialog
          open
          title={`Puštanje u rad — ${confirm.wo.woNumber}`}
          consequence="Puštanje u rad izdaje materijal po normativu kao ISSUE kretanja u knjizi zaliha (kod backflush načina materijal se troši tek pri završetku)."
          confirmLabel="Pusti u rad"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const wo = confirm.wo;
            void run(
              () => api('POST', `/api/v1/work-orders/${wo.id}/release`),
              'Nalog je pušten u rad — materijal je izdat iz knjige zaliha.',
            ).then(() => setConfirm(null));
          }}
        >
          {facts(confirm.wo)}
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'start' ? (
        <ConfirmDialog
          open
          title={
            confirm.wo.status === 'PAUSED'
              ? `Nastavak rada — ${confirm.wo.woNumber}`
              : `Pokretanje rada — ${confirm.wo.woNumber}`
          }
          consequence="Mijenja samo administrativni status naloga — ne knjiži kretanja."
          confirmLabel={confirm.wo.status === 'PAUSED' ? 'Nastavi rad' : 'Pokreni rad'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const wo = confirm.wo;
            void run(() => api('POST', `/api/v1/work-orders/${wo.id}/start`), null).then(() =>
              setConfirm(null),
            );
          }}
        >
          {facts(confirm.wo)}
          <div className="fact">
            <span>Trenutni status</span>
            <span>{WO_LABEL[confirm.wo.status]}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'pause' ? (
        <ConfirmDialog
          open
          title={`Pauziranje — ${confirm.wo.woNumber}`}
          consequence="Mijenja samo administrativni status naloga — ne knjiži kretanja."
          confirmLabel="Pauziraj"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const wo = confirm.wo;
            void run(() => api('POST', `/api/v1/work-orders/${wo.id}/pause`), null).then(() =>
              setConfirm(null),
            );
          }}
        >
          {facts(confirm.wo)}
          <div className="fact">
            <span>Trenutni status</span>
            <span>{WO_LABEL[confirm.wo.status]}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'complete' ? (
        <ConfirmDialog
          open
          title={`Završetak naloga — ${confirm.wo.woNumber}`}
          consequence="Završetak knjiži RECEIPT gotovog proizvoda u skladište (i backflush materijala ako je konfigurisan). Nalog postaje završen."
          confirmLabel="Završi nalog"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const wo = confirm.wo;
            void run(
              () =>
                api('POST', `/api/v1/work-orders/${wo.id}/complete`, {
                  goodQuantity: Number(goodQty),
                  scrapQuantity: Number(scrapQty),
                }),
              'Nalog je završen — gotov proizvod je primljen na zalihu.',
            ).then(() => {
              setConfirm(null);
              setCompleteWo('');
            });
          }}
        >
          {facts(confirm.wo)}
          <div className="fact">
            <span>Uneseno dobro</span>
            <span>{goodQty || '0'}</span>
          </div>
          <div className="fact">
            <span>Uneseni škart</span>
            <span>{scrapQty || '0'}</span>
          </div>
          <div className="fact">
            <span>Ukupno uneseno (dobro + škart)</span>
            <span>{Number(goodQty || 0) + Number(scrapQty || 0)}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'cancel' ? (
        <ConfirmDialog
          open
          danger
          title={`Otkazivanje naloga — ${confirm.wo.woNumber}`}
          consequence="Otkazivanje kompenzira već izdati materijal RECEIPT kretanjima; historija kretanja se ne briše."
          confirmLabel="Otkaži nalog"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const wo = confirm.wo;
            void run(
              () => api('POST', `/api/v1/work-orders/${wo.id}/cancel`),
              'Nalog je otkazan — izdati materijal je vraćen.',
            ).then(() => setConfirm(null));
          }}
        >
          {facts(confirm.wo)}
          <div className="fact">
            <span>Trenutni status</span>
            <span>{WO_LABEL[confirm.wo.status]}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
