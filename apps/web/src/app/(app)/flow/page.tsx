'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { EmptyState, ErrorState } from '../../../components/ui';
import { useApp } from '../app-shell';

/**
 * Tok robe (Sprint 215): a guided, end-to-end goods flow over the
 * EXISTING APIs — artikl → prijem (rekvizicija → narudžbenica →
 * prijem) → skladišno stanje → prodajna narudžba → rezervacija →
 * otprema (fulfilment). Every step is a real server call with real
 * permissions; nothing is mocked. The ship step uses an idempotent
 * shipKey, so a retry can never issue the goods twice, and package
 * staging/shipping (status only) is clearly separated from the
 * fulfilment that actually moves stock.
 */

interface Option {
  id: string;
  label: string;
}

interface StockPosition {
  onHand: string;
  reserved: string;
  available: string;
}

interface OrderLine {
  id: string;
  skuCode: string;
  quantity: string;
  reservationId: string | null;
  backordered: boolean;
}

interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  lines: OrderLine[];
}

const STEPS = [
  'Artikl',
  'Prijem robe',
  'Skladišno stanje',
  'Narudžba',
  'Rezervacija',
  'Otprema',
] as const;

function useDemoSuffix() {
  // A stable per-visit suffix keeps generated demo codes unique.
  const [suffix] = useState(() => Math.random().toString(36).slice(2, 7).toUpperCase());
  return suffix;
}

export default function FlowPage() {
  const { can } = useApp();
  const suffix = useDemoSuffix();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Master data choices.
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [accountId, setAccountId] = useState('');

  // Step results.
  const [uoms, setUoms] = useState<string[]>([]);
  const [uom, setUom] = useState('pcs');
  const [skuId, setSkuId] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [skuName, setSkuName] = useState(`Demo artikl ${'' + ''}`.trim());
  const [receiveQty, setReceiveQty] = useState('10');
  const [poNumber, setPoNumber] = useState('');
  const [position, setPosition] = useState<StockPosition | null>(null);
  const [orderQty, setOrderQty] = useState('4');
  const [order, setOrder] = useState<OrderView | null>(null);
  const [shipKey] = useState(() => `ship-${Math.random().toString(36).slice(2, 12)}`);
  const [shipped, setShipped] = useState(false);
  const [positionAfterShip, setPositionAfterShip] = useState<StockPosition | null>(null);

  useEffect(() => {
    api<{ warehouses: Array<{ id: string; code: string; name: string }> }>(
      'GET',
      '/api/v1/warehouses',
    )
      .then((r) => {
        setWarehouses(r.warehouses.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` })));
        if (r.warehouses[0]) setWarehouseId((prev) => prev || r.warehouses[0]!.id);
      })
      .catch(() => setWarehouses([]));
    api<{ suppliers: Array<{ id: string; supplierNumber?: string; name: string }> }>(
      'GET',
      '/api/v1/suppliers',
    )
      .then((r) => {
        setSuppliers(r.suppliers.map((x) => ({ id: x.id, label: x.name })));
        if (r.suppliers[0]) setSupplierId((prev) => prev || r.suppliers[0]!.id);
      })
      .catch(() => setSuppliers([]));
    api<{ accounts: Array<{ id: string; name?: string; partyName?: string }> }>(
      'GET',
      '/api/v1/crm/accounts',
    )
      .then((r) => {
        setAccounts(r.accounts.map((a) => ({ id: a.id, label: a.name ?? a.partyName ?? a.id })));
        if (r.accounts[0]) setAccountId((prev) => prev || r.accounts[0]!.id);
      })
      .catch(() => setAccounts([]));
    api<{ uoms: Array<{ code: string }> }>('GET', '/api/v1/uoms')
      .then((r) => {
        const codes = r.uoms.map((u) => u.code);
        setUoms(codes);
        if (codes.length > 0 && !codes.includes('pcs')) setUom(codes[0]!);
      })
      .catch(() => setUoms(['pcs']));
  }, []);

  async function run(fn: () => Promise<void>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const loadPosition = async (): Promise<StockPosition> => {
    const p = await api<StockPosition>(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
    );
    setPosition(p);
    return p;
  };

  // ---------------------------------------------------------- step actions

  async function createArticle(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const code = `DEMO-${suffix}`;
      const product = await api<{ id: string }>('POST', '/api/v1/products', {
        code,
        name: skuName || `Demo artikl ${suffix}`,
      });
      const sku = await api<{ id: string; code: string }>('POST', '/api/v1/skus', {
        productId: product.id,
        code,
        name: skuName || `Demo artikl ${suffix}`,
        baseUom: uom,
      });
      // Real PIM lifecycle: publish the product and activate the SKU —
      // an inactive SKU cannot be transacted in the warehouse.
      await api('POST', `/api/v1/products/${product.id}/publish`);
      await api('POST', `/api/v1/skus/${sku.id}/activate`);
      setSkuId(sku.id);
      setSkuCode(sku.code);
      setStep(1);
    }, 'Artikl kreiran i objavljen (označen kao DEMO).');
  }

  async function ensureWarehouse() {
    const w = await api<{ id: string; code: string; name: string }>('POST', '/api/v1/warehouses', {
      code: `WH-${suffix}`,
      name: `Demo skladište ${suffix}`,
    });
    setWarehouses((prev) => [...prev, { id: w.id, label: `${w.code} — ${w.name}` }]);
    setWarehouseId(w.id);
  }

  async function ensureSupplier() {
    const s = await api<{ id: string; name: string }>('POST', '/api/v1/suppliers', {
      name: `Demo dobavljač ${suffix}`,
    });
    setSuppliers((prev) => [...prev, { id: s.id, label: s.name }]);
    setSupplierId(s.id);
  }

  async function receiveGoods(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const qty = Number(receiveQty);
      // Real procurement flow: requisition (auto-approved below the
      // tenant threshold) → purchase order → receipt into the warehouse.
      const requisition = await api<{ id: string }>('POST', '/api/v1/requisitions', {
        currency: 'EUR',
        note: `Demo prijem (${suffix})`,
      });
      await api('POST', `/api/v1/requisitions/${requisition.id}/lines`, {
        skuId,
        quantity: qty,
        estUnitPrice: 1,
      });
      await api('POST', `/api/v1/requisitions/${requisition.id}/submit`);
      const po = await api<{
        id: string;
        poNumber: string;
        lines: Array<{ id: string; quantity: string }>;
      }>('POST', '/api/v1/purchase-orders', {
        requisitionId: requisition.id,
        supplierId,
        warehouseId,
      });
      await api('POST', `/api/v1/purchase-orders/${po.id}/receive`, {
        receiptKey: `rcpt-${suffix}-${po.id.slice(0, 8)}`,
        lines: po.lines.map((l) => ({ lineId: l.id, quantity: Number(l.quantity) })),
      });
      setPoNumber(po.poNumber);
      await loadPosition();
      setStep(2);
    }, 'Roba zaprimljena kroz narudžbenicu — zaliha je proknjižena kao kretanje.');
  }

  async function refreshPosition() {
    await run(async () => {
      await loadPosition();
      setStep(3);
    }, null);
  }

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const draft = await api<{ order: OrderView; unknownCodes: string[] }>(
        'POST',
        '/api/v1/orders/quick',
        {
          accountId,
          warehouseId,
          currency: 'EUR',
          lines: [{ code: skuCode, quantity: Number(orderQty) }],
        },
      );
      const confirmed = await api<OrderView>(
        'POST',
        `/api/v1/orders/${draft.order.id}/confirm`,
        {},
      );
      setOrder(confirmed);
      await loadPosition();
      setStep(4);
    }, 'Narudžba kreirana i potvrđena — zaliha je rezervisana.');
  }

  async function ship() {
    if (!order || shipped) return;
    await run(async () => {
      const updated = await api<OrderView>('POST', `/api/v1/orders/${order.id}/fulfill-lines`, {
        shipKey,
        sourceWarehouseId: warehouseId,
        lines: order.lines.map((l) => ({ lineId: l.id, quantity: Number(l.quantity) })),
      });
      setOrder(updated);
      setShipped(true);
      const p = await api<StockPosition>(
        'GET',
        `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      );
      setPositionAfterShip(p);
    }, 'Otprema izvršena — roba je stvarno izašla sa zalihe (ISSUE kretanje).');
  }

  if (!can('inventory.read')) {
    return (
      <main className="page">
        <h1>Tok robe</h1>
        <ErrorState text="Nemate dozvolu za pregled zaliha. Zatražite je od administratora." />
      </main>
    );
  }

  const positionCard = (p: StockPosition | null, title: string) =>
    p ? (
      <div className="card" style={{ marginTop: 12 }}>
        <h2>{title}</h2>
        <div className="grid-4">
          <div className="stat">
            <div className="stat-label">Na stanju</div>
            <div className="stat-value">{p.onHand}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Rezervisano</div>
            <div className="stat-value">{p.reserved}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Dostupno</div>
            <div className="stat-value">{p.available}</div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <main className="page">
      <h1>Tok robe</h1>
      <p className="page-sub">
        Vođeni tok kroz stvarne servise: artikl → prijem → stanje → narudžba → rezervacija →
        otprema. Sve što kreirate označeno je kao <strong>DEMO</strong> i knjiži se kao pravi
        podatak ovog tenanta.
      </p>

      <div className="row" style={{ marginBottom: 18 }} aria-label="Koraci toka">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`badge ${i < step ? 'badge-ok' : i === step ? 'badge-accent' : ''}`}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {error ? <ErrorState text={error} /> : null}
      {notice ? <p className="alert alert-ok">{notice}</p> : null}

      {step === 0 ? (
        <form className="card" onSubmit={createArticle}>
          <h2>1 · Artikl</h2>
          <p>Kreira proizvod i SKU (jedinica: kom) kroz katalog.</p>
          {!can('product.manage') ? (
            <ErrorState text="Za kreiranje artikla treba dozvola product.manage." />
          ) : (
            <>
              <label className="label">Naziv artikla</label>
              <input
                className="input"
                value={skuName}
                onChange={(e) => setSkuName(e.target.value)}
                placeholder={`Demo artikl ${suffix}`}
              />
              <label className="label">Jedinica mjere</label>
              <select className="input" value={uom} onChange={(e) => setUom(e.target.value)}>
                {(uoms.length > 0 ? uoms : ['pcs']).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: 12.5 }}>
                Šifra će biti DEMO-{suffix}.
              </p>
              <button className="btn btn-primary" disabled={busy} type="submit">
                Kreiraj artikl
              </button>
            </>
          )}
        </form>
      ) : null}

      {step === 1 ? (
        <form className="card" onSubmit={receiveGoods}>
          <h2>2 · Prijem robe</h2>
          <p>
            Stvarni tok nabavke: rekvizicija (ispod praga se automatski odobrava) → narudžbenica →
            prijem u skladište. Prijem knjiži RECEIPT kretanje u knjizi zaliha.
          </p>
          {!can('purchase.manage') && !can('purchase.create') ? (
            <ErrorState text="Za prijem kroz nabavku trebaju purchase dozvole." />
          ) : (
            <>
              <label className="label">Skladište</label>
              <div className="row">
                <select
                  className="input"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                {warehouses.length === 0 ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void run(ensureWarehouse, 'Demo skladište kreirano.')}
                  >
                    + demo skladište
                  </button>
                ) : null}
              </div>
              <label className="label">Dobavljač</label>
              <div className="row">
                <select
                  className="input"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void run(ensureSupplier, 'Demo dobavljač kreiran.')}
                  >
                    + demo dobavljač
                  </button>
                ) : null}
              </div>
              <label className="label">Količina prijema</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={receiveQty}
                onChange={(e) => setReceiveQty(e.target.value)}
                required
              />
              <button
                className="btn btn-primary"
                disabled={busy || !warehouseId || !supplierId}
                type="submit"
              >
                Zaprimi robu
              </button>
            </>
          )}
        </form>
      ) : null}

      {step === 2 ? (
        <div className="card">
          <h2>3 · Skladišno stanje</h2>
          <p>
            Prijem {poNumber ? <strong>{poNumber}</strong> : null} je proknjižen. Stanje dolazi iz
            knjige kretanja (nema ručno uređivanog polja zalihe).
          </p>
          {positionCard(position, `Stanje: ${skuCode}`)}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void refreshPosition()}
          >
            Osvježi stanje i nastavi
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <form className="card" onSubmit={createOrder}>
          <h2>4 · Prodajna narudžba</h2>
          {!can('order.create') ? (
            <ErrorState text="Za kreiranje narudžbe treba dozvola order.create." />
          ) : accounts.length === 0 ? (
            <EmptyState text="Nema CRM kupaca. Kreirajte kupca u CRM modulu pa se vratite." />
          ) : (
            <>
              <label className="label">Kupac</label>
              <select
                className="input"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <label className="label">Količina (dostupno: {position?.available ?? '—'})</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                required
              />
              <p className="muted" style={{ fontSize: 12.5 }}>
                Potvrda narudžbe rezerviše zalihu; količina veća od dostupne vraća razumljivu grešku
                servera.
              </p>
              <button className="btn btn-primary" disabled={busy || !accountId} type="submit">
                Kreiraj i potvrdi narudžbu
              </button>
            </>
          )}
        </form>
      ) : null}

      {step === 4 && order ? (
        <div className="card">
          <h2>5 · Rezervacija</h2>
          <p>
            Narudžba <strong>{order.orderNumber}</strong> ({order.status}) — svaka linija nosi svoju
            rezervaciju:
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Količina</th>
                <th>Rezervacija</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.skuCode}</td>
                  <td>{l.quantity}</td>
                  <td>
                    {l.reservationId ? (
                      <span className="badge badge-ok">rezervisano</span>
                    ) : l.backordered ? (
                      <span className="badge badge-warn">backorder</span>
                    ) : (
                      <span className="badge">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {positionCard(position, 'Stanje nakon rezervacije')}
          <button className="btn btn-primary" disabled={busy} onClick={() => setStep(5)}>
            Nastavi na otpremu
          </button>
        </div>
      ) : null}

      {step === 5 && order ? (
        <div className="card">
          <h2>6 · Otprema (fulfilment)</h2>
          <p>
            <strong>Status paketa nije izlaz robe.</strong> Paket „stage/ship" mijenja samo status
            pošiljke; roba stvarno izlazi tek ovim fulfilmentom, koji knjiži ISSUE kretanje. Zahtjev
            nosi idempotentan ključ <span className="mono">{shipKey}</span>, pa ponovni klik ne može
            izvršiti dvostruku otpremu.
          </p>
          {!shipped ? (
            <button
              className="btn btn-primary"
              disabled={busy || !can('order.confirm')}
              onClick={() => void ship()}
            >
              Otpremi robu
            </button>
          ) : (
            <>
              <p className="alert alert-ok">
                Narudžba {order.orderNumber} je otpremljena (status: {order.status}).
              </p>
              {positionCard(positionAfterShip, 'Stanje nakon otpreme')}
              <div className="row">
                <Link href="/inventory" className="btn">
                  Pogledaj kretanja zalihe
                </Link>
                <Link href="/orders" className="btn">
                  Otvori narudžbe
                </Link>
              </div>
            </>
          )}
          {!can('order.confirm') ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Za otpremu treba dozvola order.confirm.
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
