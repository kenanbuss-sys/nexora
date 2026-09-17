'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../../../lib/api';
import { ConfirmDialog, DataTable, EmptyState, LoadingState } from '../../../components/ui';
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
  status?: string;
}

interface RfqQuoteView {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: string;
  leadTimeDays: number | null;
  awarded: boolean;
}

interface RfqView {
  id: string;
  rfqNumber: string;
  skuCode: string;
  quantity: string;
  status: 'DRAFT' | 'SENT' | 'AWARDED' | 'CANCELLED';
  quotes: RfqQuoteView[];
}

const REQ_LABELS: Record<RequisitionView['status'], string> = {
  DRAFT: 'Nacrt',
  PENDING_APPROVAL: 'Čeka odobrenje',
  APPROVED: 'Odobrena',
  REJECTED: 'Odbijena',
  CONVERTED: 'Pretvorena u narudžbenicu',
  CANCELLED: 'Otkazana',
};

const PO_LABELS: Record<PurchaseOrderView['status'], string> = {
  OPEN: 'Otvorena',
  PARTIALLY_RECEIVED: 'Djelimično primljena',
  RECEIVED: 'Primljena',
  CANCELLED: 'Otkazana',
};

const RFQ_LABELS: Record<RfqView['status'], string> = {
  DRAFT: 'Nacrt',
  SENT: 'Poslan',
  AWARDED: 'Dodijeljen',
  CANCELLED: 'Otkazan',
};

const RFQ_BADGE: Record<RfqView['status'], string> = {
  DRAFT: 'badge-warn',
  SENT: 'badge-accent',
  AWARDED: 'badge-ok',
  CANCELLED: 'badge-danger',
};

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
  const [discrepancies, setDiscrepancies] = useState<
    Array<{
      poId: string;
      poNumber: string;
      status: string;
      lines: Array<{ description: string; ordered: string; received: string; delta: string }>;
    }>
  >([]);
  const [otd, setOtd] = useState<
    Array<{
      supplierId: string;
      supplierNumber: string;
      receivedCount: number;
      onTimePct: number | null;
    }>
  >([]);
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
  // Stabilan idempotentan ključ prijema po otvorenom PO panelu: ponovni
  // klik ili retry NE može udvostručiti prijem (ista kretanja u knjizi).
  const [receiveKey, setReceiveKey] = useState('');
  const [confirmReceive, setConfirmReceive] = useState<PurchaseOrderView | null>(null);
  const [confirmSubmitReq, setConfirmSubmitReq] = useState<RequisitionView | null>(null);
  const [confirmCancelPo, setConfirmCancelPo] = useState<PurchaseOrderView | null>(null);
  const [poFilter, setPoFilter] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [rfqs, setRfqs] = useState<RfqView[]>([]);
  const [rfqSku, setRfqSku] = useState('');
  const [rfqQty, setRfqQty] = useState('1');
  const [quoteSupplier, setQuoteSupplier] = useState<Record<string, string>>({});
  const [quotePrice, setQuotePrice] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<{ suppliers: SupplierView[] }>('GET', '/api/v1/suppliers')
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers([]));
    api<{ report: typeof discrepancies }>('GET', '/api/v1/purchase-orders/discrepancies')
      .then((r) => setDiscrepancies(r.report))
      .catch(() => setDiscrepancies([]));
    api<{ suppliers: typeof otd }>('GET', '/api/v1/suppliers/delivery-performance')
      .then((r) => setOtd(r.suppliers))
      .catch(() => setOtd([]));
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
    api<{ rfqs: RfqView[] }>('GET', '/api/v1/rfqs')
      .then((r) => setRfqs(r.rfqs))
      .catch(() => setRfqs([]));
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
              api<{ skus: Array<{ id: string; code: string; status?: string }> }>(
                'GET',
                `/api/v1/products/${p.id}`,
              ),
            ),
        );
        // Samo aktivni SKU-ovi se mogu transaktovati u skladištu — ostale
        // ne nudimo, da zahtjev ne završi u razumljivoj, ali izbježivoj grešci.
        setSkus(details.flatMap((d) => d.skus).filter((k) => !k.status || k.status === 'ACTIVE'));
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
      <div className="spread">
        <h1>Nabavka</h1>
        <Link href="/inventory" className="btn">
          Skladišno stanje →
        </Link>
      </div>
      <p className="page-sub">
        Zahtjev za nabavku → odobrenje (iznad praga) → narudžbenica → djelimični ili potpuni prijem
        — prijem knjiži RECEIPT kretanja direktno u knjigu zaliha.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Dobavljači</h2>
            <DataTable
              columns={[
                {
                  key: 'num',
                  header: 'Broj',
                  render: (x: SupplierView) => <span className="mono">{x.supplierNumber}</span>,
                  text: (x: SupplierView) => x.supplierNumber,
                },
                {
                  key: 'name',
                  header: 'Naziv',
                  render: (x: SupplierView) => (
                    <>
                      {x.partyName}
                      {x.leadTimeDays !== null ? (
                        <span className="muted"> · rok {x.leadTimeDays} d</span>
                      ) : null}
                    </>
                  ),
                  text: (x: SupplierView) => x.partyName,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (x: SupplierView) => (
                    <span
                      className={`badge ${x.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
                    >
                      {x.status === 'ACTIVE' ? 'Aktivan' : 'Blokiran'}
                    </span>
                  ),
                },
                {
                  key: 'act',
                  header: '',
                  align: 'right',
                  render: (x: SupplierView) =>
                    can('purchase.manage') ? (
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(
                                'POST',
                                `/api/v1/suppliers/${x.id}/${x.status === 'ACTIVE' ? 'block' : 'activate'}`,
                              ),
                            null,
                          )
                        }
                        type="button"
                      >
                        {x.status === 'ACTIVE' ? 'Blokiraj' : 'Aktiviraj'}
                      </button>
                    ) : null,
                },
              ]}
              rows={suppliers}
              rowKey={(x) => x.id}
              searchPlaceholder="Pretraga dobavljača…"
              pageSize={8}
              emptyText="Još nema dobavljača."
            />
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
                    'Dobavljač kreiran.',
                  ).then(() => {
                    setSupName('');
                    setSupLead('');
                  });
                }}
              >
                <input
                  className="input"
                  style={{ maxWidth: 200 }}
                  placeholder="Naziv dobavljača"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  style={{ maxWidth: 100 }}
                  type="number"
                  min="0"
                  placeholder="Rok (d)"
                  value={supLead}
                  onChange={(e) => setSupLead(e.target.value)}
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Dodaj dobavljača
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            <h2>Zahtjevi za nabavku</h2>
            {requisitions === null ? <LoadingState text="Učitavanje zahtjeva…" /> : null}
            {requisitions && requisitions.length === 0 ? (
              <EmptyState text="Još nema zahtjeva — kreirajte prvi ispod." />
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
                  <span className={`badge ${REQ_BADGE[r.status]}`}>{REQ_LABELS[r.status]}</span>
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
                        placeholder="Procij. cijena"
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
                        Dodaj stavku
                      </button>
                      {r.lines.length > 0 ? (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => setConfirmSubmitReq(r)}
                          type="button"
                        >
                          Predaj na odobrenje
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
                      Provjeri odobrenje
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
                    'Zahtjev kreiran (nacrt).',
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
                  Novi zahtjev
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
                  'Narudžbenica izdana.',
                );
              }}
            >
              <h2>Izdaj narudžbenicu</h2>
              <label className="label">Odobreni zahtjev</label>
              <select
                className="select"
                value={poReq}
                onChange={(e) => setPoReq(e.target.value)}
                required
              >
                <option value="">Odaberite…</option>
                {(requisitions ?? [])
                  .filter((r) => r.status === 'APPROVED')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.requisitionNumber} — {r.total} {r.currency}
                    </option>
                  ))}
              </select>
              <label className="label">Dobavljač</label>
              <select
                className="select"
                value={poSupplier}
                onChange={(e) => setPoSupplier(e.target.value)}
                required
              >
                <option value="">Odaberite…</option>
                {suppliers
                  .filter((s) => s.status === 'ACTIVE')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplierNumber} — {s.partyName}
                    </option>
                  ))}
              </select>
              <label className="label">Skladište isporuke</label>
              <select
                className="select"
                value={poWarehouse}
                onChange={(e) => setPoWarehouse(e.target.value)}
                required
              >
                <option value="">Odaberite…</option>
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
                Izdaj narudžbenicu
              </button>
            </form>
          ) : null}

          <div className="card">
            <h2>Narudžbenice</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <input
                className="input"
                style={{ maxWidth: 220 }}
                placeholder="Pretraga narudžbenica…"
                value={poFilter}
                onChange={(e) => setPoFilter(e.target.value)}
                aria-label="Pretraga narudžbenica"
              />
              <select
                className="input"
                style={{ maxWidth: 200 }}
                value={poStatusFilter}
                onChange={(e) => setPoStatusFilter(e.target.value)}
                aria-label="Filter po statusu"
              >
                <option value="">Svi statusi</option>
                {Object.entries(PO_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {pos.length === 0 ? (
              <EmptyState text="Još nema narudžbenica — pretvorite odobreni zahtjev." />
            ) : null}
            {pos
              .filter(
                (po) =>
                  (!poStatusFilter || po.status === poStatusFilter) &&
                  (!poFilter.trim() ||
                    po.poNumber.toLowerCase().includes(poFilter.trim().toLowerCase()) ||
                    supplierName(po.supplierId)
                      .toLowerCase()
                      .includes(poFilter.trim().toLowerCase())),
              )
              .map((po) => (
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
                    <span className={`badge ${PO_BADGE[po.status]}`}>{PO_LABELS[po.status]}</span>
                  </div>
                  {po.lines.length > 0 ? (
                    <table className="table" style={{ marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th>Stavka</th>
                          <th>Naručeno</th>
                          <th>Primljeno</th>
                          <th>Preostalo</th>
                          {receivePo === po.id ? (
                            <th style={{ textAlign: 'right' }}>Prijem</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {po.lines.map((l) => (
                          <tr key={l.id}>
                            <td>{l.description}</td>
                            <td className="mono">{Number(l.quantity)}</td>
                            <td className="mono">{Number(l.receivedQty)}</td>
                            <td className="mono">
                              {Math.max(0, Number(l.quantity) - Number(l.receivedQty))}
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
                                  placeholder="Kol."
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
                    {['OPEN', 'PARTIALLY_RECEIVED'].includes(po.status) &&
                    can('purchase.receive') ? (
                      receivePo === po.id ? (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busy || !Object.values(receiveQty).some((v) => Number(v) > 0)}
                            onClick={() => setConfirmReceive(po)}
                            type="button"
                          >
                            Proknjiži prijem
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setReceivePo('');
                              setReceiveQty({});
                            }}
                            type="button"
                          >
                            Zatvori
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setReceivePo(po.id);
                            setReceiveQty({});
                            setReceiveKey(`rcpt-${po.id.slice(0, 8)}-${Date.now()}`);
                          }}
                          type="button"
                        >
                          Prijem robe
                        </button>
                      )
                    ) : null}
                    {po.status === 'OPEN' && can('purchase.manage') ? (
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => setConfirmCancelPo(po)}
                        type="button"
                      >
                        Otkaži
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
          <h2>Učinak dobavljača</h2>
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Dobavljač</th>
                <th>Narudžbe</th>
                <th>Potrošnja</th>
                <th>Popunjenost</th>
                <th>Prosj. vrijeme prijema</th>
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

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Zahtjevi za ponudu (RFQ)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Zatražite ponude dobavljača za jedan artikal i dodijelite najbolju.
        </p>
        {rfqs.length === 0 ? <EmptyState text="Još nema RFQ-ova." /> : null}
        {rfqs.map((r) => (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <div className="row spread">
              <span>
                <strong className="mono">{r.rfqNumber}</strong>{' '}
                <span className="mono muted">
                  {r.skuCode} × {Number(r.quantity)}
                </span>{' '}
                <span className={`badge ${RFQ_BADGE[r.status]}`}>{RFQ_LABELS[r.status]}</span>
              </span>
              <span>
                {can('purchase.manage') && r.status === 'DRAFT' ? (
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api('POST', `/api/v1/rfqs/${r.id}/send`),
                        'RFQ poslan dobavljačima.',
                      )
                    }
                    type="button"
                  >
                    Pošalji
                  </button>
                ) : null}
              </span>
            </div>
            {r.quotes.map((q) => (
              <div key={q.id} className="row spread" style={{ marginLeft: 12, marginTop: 4 }}>
                <span style={{ fontSize: 13 }}>
                  {q.supplierName} <span className="mono">{q.unitPrice}</span>
                  {q.leadTimeDays !== null ? (
                    <span className="muted"> · {q.leadTimeDays}d</span>
                  ) : null}
                  {q.awarded ? <span className="badge badge-ok"> DODIJELJENO</span> : null}
                </span>
                <span>
                  {can('purchase.approve') && r.status === 'SENT' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/rfqs/${r.id}/award`, { quoteId: q.id }),
                          'RFQ dodijeljen.',
                        )
                      }
                      type="button"
                    >
                      Dodijeli
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            {can('purchase.manage') && r.status === 'SENT' ? (
              <form
                className="row"
                style={{ marginLeft: 12, marginTop: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', `/api/v1/rfqs/${r.id}/quotes`, {
                        supplierId: quoteSupplier[r.id],
                        unitPrice: Number(quotePrice[r.id]),
                      }),
                    'Ponuda evidentirana.',
                  );
                }}
              >
                <select
                  className="input"
                  value={quoteSupplier[r.id] ?? ''}
                  onChange={(e) => setQuoteSupplier({ ...quoteSupplier, [r.id]: e.target.value })}
                  required
                >
                  <option value="">Dobavljač…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.partyName}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ width: 110 }}
                  placeholder="Jedinična cijena"
                  value={quotePrice[r.id] ?? ''}
                  onChange={(e) => setQuotePrice({ ...quotePrice, [r.id]: e.target.value })}
                  required
                />
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Evidentiraj ponudu
                </button>
              </form>
            ) : null}
          </div>
        ))}
        {can('purchase.manage') ? (
          <form
            className="row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api('POST', '/api/v1/rfqs', { skuId: rfqSku, quantity: Number(rfqQty) }),
                'RFQ kreiran.',
              );
            }}
          >
            <select
              className="input"
              value={rfqSku}
              onChange={(e) => setRfqSku(e.target.value)}
              required
            >
              <option value="">SKU…</option>
              {skus.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.code}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 90 }}
              value={rfqQty}
              onChange={(e) => setRfqQty(e.target.value)}
              required
            />
            <button className="btn btn-sm" disabled={busy} type="submit">
              Novi RFQ
            </button>
          </form>
        ) : null}
      </div>

      {discrepancies.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Odstupanja pri prijemu</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Primljene količine koje ne odgovaraju naručenim.
          </p>
          {discrepancies.slice(0, 8).map((d) => (
            <div key={d.poId} style={{ marginBottom: 8 }}>
              <strong className="mono">{d.poNumber}</strong>{' '}
              <span className="badge badge-warn">{d.status}</span>
              {d.lines.map((l, i) => (
                <div key={i} className="muted mono" style={{ fontSize: 12 }}>
                  {l.description}: {l.received}/{l.ordered} (Δ {l.delta})
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {otd.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Isporuka na vrijeme</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Potpuno primljene narudžbenice stigle na ili prije očekivanog datuma.
          </p>
          {otd.map((row) => (
            <div key={row.supplierId} className="row spread" style={{ marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 13 }}>
                {row.supplierNumber}
              </span>
              <span>
                {row.onTimePct !== null ? (
                  <span
                    className={`badge ${
                      row.onTimePct >= 90
                        ? 'badge-ok'
                        : row.onTimePct >= 60
                          ? 'badge-warn'
                          : 'badge-danger'
                    }`}
                  >
                    {row.onTimePct}% na vrijeme
                  </span>
                ) : (
                  <span className="badge">bez rokova</span>
                )}{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {row.receivedCount} primljeno
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {confirmSubmitReq ? (
        <ConfirmDialog
          open
          title={`Predaja zahtjeva ${confirmSubmitReq.requisitionNumber}`}
          consequence="Iznos iznad tenant praga ide na odobrenje; ispod praga zahtjev se odmah odobrava."
          confirmLabel="Predaj na odobrenje"
          busy={busy}
          onCancel={() => setConfirmSubmitReq(null)}
          onConfirm={() => {
            const r = confirmSubmitReq;
            void run(
              () => api('POST', `/api/v1/requisitions/${r.id}/submit`),
              'Zahtjev predat — provjerite status odobrenja.',
            ).then(() => setConfirmSubmitReq(null));
          }}
        >
          <div className="fact">
            <span>Zahtjev</span>
            <span className="mono">{confirmSubmitReq.requisitionNumber}</span>
          </div>
          <div className="fact">
            <span>Stavki</span>
            <span>{confirmSubmitReq.lines.length}</span>
          </div>
          <div className="fact">
            <span>Ukupno (procjena)</span>
            <span>
              {confirmSubmitReq.total} {confirmSubmitReq.currency}
            </span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmReceive
        ? (() => {
            const po = confirmReceive;
            const entered = po.lines
              .map((l) => ({
                line: l,
                qty: Number(receiveQty[l.id] ?? 0),
                remaining: Math.max(0, Number(l.quantity) - Number(l.receivedQty)),
              }))
              .filter((x) => x.qty > 0);
            const over = entered.some((x) => x.qty > x.remaining);
            return (
              <ConfirmDialog
                open
                title={`Prijem robe — ${po.poNumber}`}
                consequence={
                  over
                    ? 'PAŽNJA: unesena količina je veća od preostale — prijem će biti evidentiran kao odstupanje u izvještaju. Prijem knjiži RECEIPT kretanja u knjigu zaliha (idempotentan ključ — ponovni klik ne duplira).'
                    : 'Prijem knjiži RECEIPT kretanja direktno u knjigu zaliha (idempotentan ključ — ponovni klik ne duplira prijem).'
                }
                confirmLabel="Proknjiži prijem"
                danger={over}
                busy={busy}
                onCancel={() => setConfirmReceive(null)}
                onConfirm={() => {
                  void run(
                    () =>
                      api('POST', `/api/v1/purchase-orders/${po.id}/receive`, {
                        receiptKey: receiveKey,
                        lines: entered.map((x) => ({ lineId: x.line.id, quantity: x.qty })),
                      }),
                    'Roba zaprimljena — kretanja su u knjizi zaliha.',
                  ).then(() => {
                    setConfirmReceive(null);
                    setReceivePo('');
                    setReceiveQty({});
                    setReceiveKey('');
                  });
                }}
              >
                <div className="fact">
                  <span>Dobavljač</span>
                  <span>{supplierName(po.supplierId)}</span>
                </div>
                {entered.map((x) => (
                  <div key={x.line.id} className="fact">
                    <span>{x.line.description}</span>
                    <span className="mono">
                      prijem {x.qty} (preostalo {x.remaining})
                    </span>
                  </div>
                ))}
              </ConfirmDialog>
            );
          })()
        : null}

      {confirmCancelPo ? (
        <ConfirmDialog
          open
          danger
          title={`Otkazivanje narudžbenice ${confirmCancelPo.poNumber}`}
          consequence="Otkazana narudžbenica se više ne može zaprimati; već proknjiženi prijemi ostaju u knjizi."
          confirmLabel="Otkaži narudžbenicu"
          busy={busy}
          onCancel={() => setConfirmCancelPo(null)}
          onConfirm={() => {
            const po = confirmCancelPo;
            void run(
              () => api('POST', `/api/v1/purchase-orders/${po.id}/cancel`),
              'Narudžbenica otkazana.',
            ).then(() => setConfirmCancelPo(null));
          }}
        >
          <div className="fact">
            <span>Narudžbenica</span>
            <span className="mono">{confirmCancelPo.poNumber}</span>
          </div>
          <div className="fact">
            <span>Iznos</span>
            <span>
              {confirmCancelPo.total} {confirmCancelPo.currency}
            </span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
