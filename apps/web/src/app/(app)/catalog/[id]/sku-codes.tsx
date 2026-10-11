'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../../lib/api';
import { gtinHint } from '../../../../lib/gtin';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../../../components/ui';

/** Barcode symbologies the API accepts (PIM-005). GTIN is the default. */
const BARCODE_TYPES = ['GTIN', 'CODE128', 'CODE39', 'QR', 'DATAMATRIX', 'INTERNAL'] as const;
type BarcodeType = (typeof BARCODE_TYPES)[number];

const BARCODE_TYPE_LABEL: Record<BarcodeType, string> = {
  GTIN: 'GTIN (EAN/UPC)',
  CODE128: 'Code 128',
  CODE39: 'Code 39',
  QR: 'QR kod',
  DATAMATRIX: 'Data Matrix',
  INTERNAL: 'Interni kod',
};

interface BarcodeView {
  value: string;
  barcodeType: string;
  createdAt: string;
}

interface ConversionView {
  fromUom: string;
  toUom: string;
  factor: string;
}

interface SkuRef {
  id: string;
  code: string;
  baseUom: string;
}

interface Props {
  skus: SkuRef[];
  uoms: Array<{ code: string; name: string }>;
  canManageBarcodes: boolean;
  canManageProduct: boolean;
}

/**
 * Per-SKU barcodes (PIM-005) and UOM conversions (PIM-007). The server
 * validates GTIN check digits, uniqueness against unit and pack barcodes,
 * and conversion factors; this card only shows hints and server errors.
 */
export function SkuCodesCard({ skus, uoms, canManageBarcodes, canManageProduct }: Props) {
  const [skuId, setSkuId] = useState(skus[0]?.id ?? '');
  const [barcodes, setBarcodes] = useState<BarcodeView[] | null>(null);
  const [conversions, setConversions] = useState<ConversionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('GTIN');
  const [removeTarget, setRemoveTarget] = useState<BarcodeView | null>(null);
  const [convFrom, setConvFrom] = useState('');
  const [convFactor, setConvFactor] = useState('');

  const sku = skus.find((s) => s.id === skuId) ?? null;

  useEffect(() => {
    if (!skus.some((s) => s.id === skuId)) setSkuId(skus[0]?.id ?? '');
  }, [skus, skuId]);

  const load = useCallback(() => {
    if (!skuId) return;
    setBarcodes(null);
    setConversions(null);
    setLoadError(null);
    Promise.all([
      api<{ barcodes: BarcodeView[] }>('GET', `/api/v1/skus/${skuId}/barcodes`),
      api<{ conversions: ConversionView[] }>('GET', `/api/v1/skus/${skuId}/uom-conversions`),
    ])
      .then(([b, c]) => {
        setBarcodes(b.barcodes);
        setConversions(c.conversions);
      })
      .catch((e: unknown) => setLoadError(errorText(e)));
  }, [skuId]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, successText: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
      load();
      return true;
    } catch (e: unknown) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const hint = barcodeType === 'GTIN' ? gtinHint(value) : null;
  const typeLabel = (t: string) => BARCODE_TYPE_LABEL[t as BarcodeType] ?? t;
  const otherUoms = uoms.filter((u) => u.code !== sku?.baseUom);

  if (skus.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Barkodovi i jedinice mjere</h2>
      <p className="muted">
        Barkodovi jedinice po SKU-u i pretvorbe u osnovnu JM. Server provjerava GTIN kontrolnu cifru
        i jedinstvenost (i u odnosu na barkodove pakovanja).
      </p>
      <label className="label" htmlFor="sku-codes-sku">
        SKU
      </label>
      <select
        id="sku-codes-sku"
        className="select"
        style={{ maxWidth: 260 }}
        value={skuId}
        onChange={(e) => {
          setSkuId(e.target.value);
          setError(null);
          setNotice(null);
        }}
      >
        {skus.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} ({s.baseUom})
          </option>
        ))}
      </select>

      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {loadError ? <ErrorState text={loadError} /> : null}

      <h3 style={{ marginTop: 14 }}>Barkodovi</h3>
      {!loadError && barcodes === null ? <LoadingState text="Učitavanje barkodova…" /> : null}
      {barcodes !== null && barcodes.length === 0 ? (
        <EmptyState text="Ovaj SKU još nema barkod jedinice." />
      ) : null}
      {barcodes !== null && barcodes.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Vrijednost</th>
              <th>Tip</th>
              <th>Dodijeljen</th>
              {canManageBarcodes ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {barcodes.map((b) => (
              <tr key={b.value}>
                <td className="mono">{b.value}</td>
                <td>{typeLabel(b.barcodeType)}</td>
                <td className="muted">{new Date(b.createdAt).toLocaleDateString()}</td>
                {canManageBarcodes ? (
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      aria-label={`Ukloni barkod ${b.value}`}
                      onClick={() => setRemoveTarget(b)}
                    >
                      Ukloni
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {canManageBarcodes ? (
        <form
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (!skuId || !v) return;
            void run(
              () => api('POST', '/api/v1/barcodes', { skuId, value: v, barcodeType }),
              'Barkod je dodijeljen.',
            ).then((ok) => {
              if (ok) setValue('');
            });
          }}
        >
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label" htmlFor="sku-codes-type">
                Tip barkoda
              </label>
              <select
                id="sku-codes-type"
                className="select"
                value={barcodeType}
                onChange={(e) => setBarcodeType(e.target.value as BarcodeType)}
              >
                {BARCODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BARCODE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="label" htmlFor="sku-codes-value">
                Vrijednost barkoda
              </label>
              <input
                id="sku-codes-value"
                className="input mono"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-describedby={hint ? 'sku-codes-hint' : undefined}
                maxLength={128}
                required
              />
            </div>
            <button className="btn btn-primary" disabled={busy || !skuId} type="submit">
              Dodijeli
            </button>
          </div>
          {hint ? (
            <p
              id="sku-codes-hint"
              className="muted"
              role="status"
              style={{
                fontSize: 12.5,
                marginTop: 4,
                color: hint.ok ? 'var(--color-accent)' : undefined,
              }}
            >
              {hint.ok ? '✓ ' : '⚠ '}
              {hint.text}
              {hint.ok ? '' : ' Server konačno odlučuje.'}
            </p>
          ) : null}
        </form>
      ) : null}

      <h3 style={{ marginTop: 18 }}>Pretvorbe jedinica mjere</h3>
      {!loadError && conversions === null ? <LoadingState text="Učitavanje pretvorbi…" /> : null}
      {conversions !== null && conversions.length === 0 ? (
        <EmptyState
          text={`Nema pretvorbi — kretanja se unose samo u osnovnoj JM (${sku?.baseUom ?? '—'}).`}
        />
      ) : null}
      {conversions !== null && conversions.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Iz JM</th>
              <th>U JM</th>
              <th style={{ textAlign: 'right' }}>Faktor</th>
            </tr>
          </thead>
          <tbody>
            {conversions.map((c) => (
              <tr key={`${c.fromUom}->${c.toUom}`}>
                <td className="mono">1 {c.fromUom}</td>
                <td className="mono">{c.toUom}</td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  × {c.factor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {canManageProduct && sku ? (
        <form
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!convFrom || !convFactor) return;
            void run(
              () =>
                api('PUT', `/api/v1/skus/${sku.id}/uom-conversions`, {
                  fromUom: convFrom,
                  toUom: sku.baseUom,
                  factor: Number(convFactor),
                }),
              'Pretvorba jedinice mjere je sačuvana.',
            ).then((ok) => {
              if (ok) {
                setConvFrom('');
                setConvFactor('');
              }
            });
          }}
        >
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label" htmlFor="sku-codes-conv-from">
                1 jedinica
              </label>
              {otherUoms.length > 0 ? (
                <select
                  id="sku-codes-conv-from"
                  className="select"
                  value={convFrom}
                  onChange={(e) => setConvFrom(e.target.value)}
                  required
                >
                  <option value="">JM…</option>
                  {otherUoms.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="sku-codes-conv-from"
                  className="input mono"
                  style={{ maxWidth: 110 }}
                  placeholder="npr. box"
                  value={convFrom}
                  onChange={(e) => setConvFrom(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <label className="label" htmlFor="sku-codes-conv-factor">
                = {sku.baseUom}
              </label>
              <input
                id="sku-codes-conv-factor"
                className="input"
                style={{ maxWidth: 120 }}
                type="number"
                min="0.000001"
                step="any"
                value={convFactor}
                onChange={(e) => setConvFactor(e.target.value)}
                required
              />
            </div>
            <button className="btn" disabled={busy || !convFrom || !convFactor} type="submit">
              Sačuvaj pretvorbu
            </button>
          </div>
        </form>
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          open
          title="Uklanjanje barkoda"
          consequence="Skeniranje ovog koda više neće pronaći SKU; postojeća kretanja zaliha se ne mijenjaju."
          confirmLabel="Ukloni barkod"
          danger
          busy={busy}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => {
            const target = removeTarget;
            void run(async () => {
              await api('POST', `/api/v1/barcodes/${encodeURIComponent(target.value)}/remove`);
              setRemoveTarget(null);
            }, `Barkod ${target.value} je uklonjen.`);
          }}
        >
          <div className="fact">
            <span>SKU</span>
            <span className="mono">{sku?.code ?? '—'}</span>
          </div>
          <div className="fact">
            <span>Barkod</span>
            <span className="mono">{removeTarget.value}</span>
          </div>
          <div className="fact">
            <span>Tip</span>
            <span>{typeLabel(removeTarget.barcodeType)}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
