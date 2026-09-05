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

interface CategoryView {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  productCount: number;
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
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [images, setImages] = useState<Array<{ id: string; fileName: string; src: string }>>([]);
  const [logSku, setLogSku] = useState('');
  const [logWeight, setLogWeight] = useState('');
  const [logL, setLogL] = useState('');
  const [logW, setLogW] = useState('');
  const [logH, setLogH] = useState('');
  const [packSku, setPackSku] = useState('');
  const [packName, setPackName] = useState('');
  const [packUnits, setPackUnits] = useState('');
  const [packBarcode, setPackBarcode] = useState('');
  const [packs, setPacks] = useState<
    Array<{ id: string; name: string; unitsPerPack: string; barcodeValue: string | null }>
  >([]);
  const [subPrimary, setSubPrimary] = useState('');
  const [subAlt, setSubAlt] = useState('');
  const [subs, setSubs] = useState<Array<{ id: string; substituteCode: string; priority: number }>>(
    [],
  );
  const loadImages = useCallback(() => {
    api<{
      attachments: Array<{ id: string; fileName: string; contentType: string }>;
    }>('GET', `/api/v1/attachments?entityType=product&entityId=${productId}`)
      .then(async (r) => {
        const pictures = r.attachments.filter((a) => a.contentType.startsWith('image/'));
        const loaded = await Promise.all(
          pictures.slice(0, 8).map(async (a) => {
            const file = await api<{ contentType: string; dataBase64: string }>(
              'GET',
              `/api/v1/attachments/${a.id}/download`,
            );
            return {
              id: a.id,
              fileName: a.fileName,
              src: `data:${file.contentType};base64,${file.dataBase64}`,
            };
          }),
        );
        setImages(loaded);
      })
      .catch(() => setImages([]));
  }, [productId]);

  useEffect(loadImages, [loadImages]);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be product media');
      return;
    }
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    await run(async () => {
      await api('POST', '/api/v1/attachments', {
        entityType: 'product',
        entityId: productId,
        fileName: file.name,
        contentType: file.type,
        dataBase64: btoa(binary),
      });
      loadImages();
    }, 'Image uploaded.');
  }

  const [axis1, setAxis1] = useState('color');
  const [values1, setValues1] = useState('');
  const [axis2, setAxis2] = useState('size');
  const [values2, setValues2] = useState('');

  const load = useCallback(() => {
    api<ProductDetail>('GET', `/api/v1/products/${productId}`)
      .then((r) => {
        setProduct(r);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [productId]);

  useEffect(load, [load]);

  useEffect(() => {
    api<{ categories: CategoryView[] }>('GET', '/api/v1/catalog/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, [notice]);

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

          {can('collab.use') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Media</h2>
              <p className="muted">Product photos — shown here and stored with the product.</p>
              {images.length > 0 ? (
                <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                  {images.map((img) => (
                    // eslint-disable-next-line
                    <img
                      key={img.id}
                      src={img.src}
                      alt={img.fileName}
                      title={img.fileName}
                      style={{
                        width: 110,
                        height: 110,
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid var(--color-border)',
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty">No photos yet.</div>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => {
                    void uploadImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Logistics</h2>
              <p className="muted">
                Weight and dimensions per base unit — order totals derive from this.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 150 }}
                  value={logSku}
                  onChange={(e) => setLogSku(e.target.value)}
                >
                  <option value="">SKU…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ maxWidth: 90 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="kg"
                  value={logWeight}
                  onChange={(e) => setLogWeight(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="L cm"
                  value={logL}
                  onChange={(e) => setLogL(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="W cm"
                  value={logW}
                  onChange={(e) => setLogW(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="H cm"
                  value={logH}
                  onChange={(e) => setLogH(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !logSku}
                  type="button"
                  onClick={() =>
                    run(
                      () =>
                        api('POST', `/api/v1/skus/${logSku}/logistics`, {
                          ...(logWeight ? { weightKg: Number(logWeight) } : {}),
                          ...(logL ? { lengthCm: Number(logL) } : {}),
                          ...(logW ? { widthCm: Number(logW) } : {}),
                          ...(logH ? { heightCm: Number(logH) } : {}),
                        }),
                      'Logistics saved.',
                    )
                  }
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Packaging</h2>
              <p className="muted">
                Pack levels above the base unit — a pack barcode scans straight to the SKU with its
                multiplier.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={packSku}
                  onChange={(e) => {
                    const skuId = e.target.value;
                    setPackSku(skuId);
                    setPacks([]);
                    if (skuId) {
                      api<{
                        levels: Array<{
                          id: string;
                          name: string;
                          unitsPerPack: string;
                          barcodeValue: string | null;
                        }>;
                      }>('GET', `/api/v1/skus/${skuId}/packaging`)
                        .then((r) => setPacks(r.levels))
                        .catch(() => setPacks([]));
                    }
                  }}
                >
                  <option value="">SKU…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ maxWidth: 110 }}
                  placeholder="Pack name"
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  min="2"
                  step="any"
                  placeholder="Units"
                  value={packUnits}
                  onChange={(e) => setPackUnits(e.target.value)}
                />
                <input
                  className="input mono"
                  style={{ maxWidth: 140 }}
                  placeholder="Barcode (optional)"
                  value={packBarcode}
                  onChange={(e) => setPackBarcode(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !packSku || !packName || !packUnits}
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await api('POST', `/api/v1/skus/${packSku}/packaging`, {
                        name: packName,
                        unitsPerPack: Number(packUnits),
                        ...(packBarcode.trim() ? { barcodeValue: packBarcode.trim() } : {}),
                      });
                      setPackName('');
                      setPackUnits('');
                      setPackBarcode('');
                      const r = await api<{
                        levels: Array<{
                          id: string;
                          name: string;
                          unitsPerPack: string;
                          barcodeValue: string | null;
                        }>;
                      }>('GET', `/api/v1/skus/${packSku}/packaging`);
                      setPacks(r.levels);
                    }, 'Pack level added.')
                  }
                >
                  Add pack
                </button>
              </div>
              {packs.length > 0 ? (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {packs.map((pk) => (
                    <span key={pk.id} className="badge mono">
                      {pk.name} = {pk.unitsPerPack}
                      {pk.barcodeValue ? ` · ${pk.barcodeValue}` : ''}
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4, padding: '0 6px' }}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api('POST', `/api/v1/skus/${packSku}/packaging/${pk.id}/remove`);
                            setPacks((prev) => prev.filter((x) => x.id !== pk.id));
                          }, 'Pack level removed.')
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Substitutions</h2>
              <p className="muted">
                Alternatives offered when a SKU cannot be served (shown on backordered lines).
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={subPrimary}
                  onChange={(e) => {
                    const skuId = e.target.value;
                    setSubPrimary(skuId);
                    setSubs([]);
                    if (skuId) {
                      api<{
                        substitutions: Array<{
                          id: string;
                          substituteCode: string;
                          priority: number;
                        }>;
                      }>('GET', `/api/v1/skus/${skuId}/substitutions`)
                        .then((r) => setSubs(r.substitutions))
                        .catch(() => setSubs([]));
                    }
                  }}
                >
                  <option value="">Primary SKU…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={subAlt}
                  onChange={(e) => setSubAlt(e.target.value)}
                >
                  <option value="">Substitute…</option>
                  {product.skus
                    .filter((s) => s.id !== subPrimary)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                      </option>
                    ))}
                </select>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !subPrimary || !subAlt}
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await api('POST', `/api/v1/skus/${subPrimary}/substitutions`, {
                        substituteSkuId: subAlt,
                      });
                      const r = await api<{
                        substitutions: Array<{
                          id: string;
                          substituteCode: string;
                          priority: number;
                        }>;
                      }>('GET', `/api/v1/skus/${subPrimary}/substitutions`);
                      setSubs(r.substitutions);
                    }, 'Substitution added.')
                  }
                >
                  Add substitution
                </button>
              </div>
              {subs.length > 0 ? (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {subs.map((sub) => (
                    <span key={sub.id} className="badge mono">
                      → {sub.substituteCode}{' '}
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4, padding: '0 6px' }}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(
                              'POST',
                              `/api/v1/skus/${subPrimary}/substitutions/${sub.id}/remove`,
                            );
                            setSubs((prev) => prev.filter((x) => x.id !== sub.id));
                          }, 'Substitution removed.')
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Merchandising</h2>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label className="label">Category</label>
                  <select
                    className="select"
                    style={{ minWidth: 200 }}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        void run(
                          () =>
                            api('POST', `/api/v1/catalog/products/${productId}/category`, {
                              categoryId: e.target.value,
                            }),
                          'Product assigned to the category.',
                        );
                      }
                    }}
                  >
                    <option value="">Assign to category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => {
                    const code = window.prompt('New category code (e.g. LIGHTING)');
                    if (!code) return;
                    const name = window.prompt('Category name') ?? code;
                    void run(
                      () => api('POST', '/api/v1/catalog/categories', { code, name }),
                      'Category created.',
                    );
                  }}
                  type="button"
                >
                  New category
                </button>
              </div>

              <div
                style={{
                  marginTop: 14,
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 10,
                }}
              >
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  Variant generator — one SKU per combination (e.g. color × size).
                </div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <input
                    className="input mono"
                    style={{ maxWidth: 100 }}
                    value={axis1}
                    onChange={(e) => setAxis1(e.target.value)}
                    placeholder="axis 1"
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={values1}
                    onChange={(e) => setValues1(e.target.value)}
                    placeholder="red, blue, black"
                  />
                  <input
                    className="input mono"
                    style={{ maxWidth: 100 }}
                    value={axis2}
                    onChange={(e) => setAxis2(e.target.value)}
                    placeholder="axis 2 (optional)"
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 160 }}
                    value={values2}
                    onChange={(e) => setValues2(e.target.value)}
                    placeholder="S, M, L"
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || !axis1 || !values1.trim()}
                    onClick={() => {
                      const axes: Record<string, string[]> = {
                        [axis1]: values1
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      };
                      if (axis2 && values2.trim()) {
                        axes[axis2] = values2
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean);
                      }
                      void run(
                        () =>
                          api(`POST`, `/api/v1/catalog/products/${productId}/variants`, {
                            axes,
                            baseUom: 'pcs',
                          }),
                        'Variants generated.',
                      );
                    }}
                    type="button"
                  >
                    Generate variants
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
