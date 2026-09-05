'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../../lib/api';
import { useApp } from '../../app-shell';

interface SkuView {
  id: string;
  productId: string;
  code: string;
  name: string;
  baseUom: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISCONTINUED';
}

interface ProductDetail {
  id: string;
  code: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  skus: SkuView[];
}

const SKU_BADGE: Record<SkuView['status'], string> = {
  DRAFT: 'badge-warn',
  ACTIVE: 'badge-ok',
  DISCONTINUED: 'badge-danger',
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { can } = useApp();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [skuCode, setSkuCode] = useState('');
  const [skuName, setSkuName] = useState('');
  const [baseUom, setBaseUom] = useState('pcs');
  const [barcodeSku, setBarcodeSku] = useState('');
  const [barcodeValue, setBarcodeValue] = useState('');

  const load = useCallback(() => {
    api<ProductDetail>('GET', `/api/v1/products/${productId}`)
      .then((r) => {
        setProduct(r);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [productId]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!product && !error) return <div className="loading page">Loading product…</div>;

  return (
    <main className="page">
      <p style={{ margin: '0 0 8px' }}>
        <Link href="/catalog">← Catalog</Link>
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      {product ? (
        <>
          <div className="spread">
            <div>
              <h1>
                <span className="mono">{product.code}</span> — {product.name}
              </h1>
              <span
                className={`badge ${product.status === 'PUBLISHED' ? 'badge-ok' : 'badge-warn'}`}
              >
                {product.status}
              </span>
            </div>
            {product.status === 'DRAFT' && can('product.publish') ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() => api('POST', `/api/v1/products/${product.id}/publish`), 'Published.')
                }
                type="button"
              >
                Publish product
              </button>
            ) : null}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>SKUs</h2>
            {product.skus.length === 0 ? (
              <div className="empty">No SKUs yet — add the first sellable unit.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Base UoM</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {product.skus.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.code}</td>
                      <td>{s.name}</td>
                      <td>{s.baseUom}</td>
                      <td>
                        <span className={`badge ${SKU_BADGE[s.status]}`}>{s.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.status === 'DRAFT' && can('product.publish') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => api('POST', `/api/v1/skus/${s.id}/activate`),
                                `SKU ${s.code} activated.`,
                              )
                            }
                            type="button"
                          >
                            Activate
                          </button>
                        ) : null}
                        {can('product.manage') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            title="Lot tracking & shelf life (FEFO)"
                            onClick={() => {
                              const answer = window.prompt(
                                'Shelf life in days for lot tracking (empty disables lot tracking)',
                                '365',
                              );
                              if (answer === null) return;
                              const days = answer.trim() === '' ? null : Number(answer);
                              void run(
                                () =>
                                  api('POST', `/api/v1/skus/${s.id}/lot-policy`, {
                                    lotTracked: days !== null,
                                    shelfLifeDays: days,
                                  }),
                                days !== null
                                  ? `SKU ${s.code} is lot-tracked (shelf life ${days} days).`
                                  : `Lot tracking disabled for ${s.code}.`,
                              );
                            }}
                            type="button"
                          >
                            Lot policy
                          </button>
                        ) : null}{' '}
                        {s.status === 'ACTIVE' && can('product.manage') ? (
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => api('POST', `/api/v1/skus/${s.id}/discontinue`),
                                `SKU ${s.code} discontinued.`,
                              )
                            }
                            type="button"
                          >
                            Discontinue
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid-2">
            {can('product.manage') ? (
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/skus', {
                        productId: product.id,
                        code: skuCode,
                        name: skuName,
                        baseUom,
                      }),
                    `SKU ${skuCode} created (draft).`,
                  ).then(() => {
                    setSkuCode('');
                    setSkuName('');
                  });
                }}
              >
                <h2>New SKU</h2>
                <label className="label">Code</label>
                <input
                  className="input mono"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  required
                />
                <label className="label">Name</label>
                <input
                  className="input"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  required
                />
                <label className="label">Base unit of measure</label>
                <input
                  className="input"
                  value={baseUom}
                  onChange={(e) => setBaseUom(e.target.value)}
                  required
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Add SKU
                </button>
              </form>
            ) : null}

            {can('product.barcode.manage') && product.skus.length > 0 ? (
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/barcodes', { skuId: barcodeSku, value: barcodeValue }),
                    'Barcode assigned.',
                  ).then(() => setBarcodeValue(''));
                }}
              >
                <h2>Assign barcode</h2>
                <label className="label">SKU</label>
                <select
                  className="select"
                  value={barcodeSku}
                  onChange={(e) => setBarcodeSku(e.target.value)}
                  required
                >
                  <option value="">Select SKU…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <label className="label">Barcode value</label>
                <input
                  className="input mono"
                  value={barcodeValue}
                  onChange={(e) => setBarcodeValue(e.target.value)}
                  required
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Assign
                </button>
              </form>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
