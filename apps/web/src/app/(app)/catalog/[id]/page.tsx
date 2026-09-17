'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../../lib/api';
import { EmptyState, ErrorState, LoadingState } from '../../../../components/ui';
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

const SKU_LABEL: Record<SkuView['status'], string> = {
  DRAFT: 'Nacrt',
  ACTIVE: 'Aktivan',
  DISCONTINUED: 'Ukinut',
};

const PRODUCT_LABEL: Record<ProductDetail['status'], string> = {
  DRAFT: 'Nacrt',
  PUBLISHED: 'Objavljen',
  ARCHIVED: 'Arhiviran',
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
  const [uoms, setUoms] = useState<Array<{ code: string; name: string }>>([]);
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
  const [bundleSku, setBundleSku] = useState('');
  const [serialSku, setSerialSku] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [serialData, setSerialData] = useState<{
    policy: string;
    serials: Array<{ id: string; serial: string; status: string }>;
  } | null>(null);
  const [ccSku, setCcSku] = useState('');
  const [ccChannel, setCcChannel] = useState('webshop');
  const [ccTitle, setCcTitle] = useState('');
  const [ccDesc, setCcDesc] = useState('');
  const [ccList, setCcList] = useState<
    Array<{ channel: string; title: string; description: string | null }>
  >([]);
  const [bundleComp, setBundleComp] = useState('');
  const [bundleQty, setBundleQty] = useState('1');
  const [bundle, setBundle] = useState<{
    components: Array<{
      id: string;
      componentCode: string;
      quantity: string;
      available: string;
    }>;
    buildable: number;
  } | null>(null);
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
      setError('Samo slike mogu biti medijski zapisi artikla.');
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
    }, 'Slika je dodana.');
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

  useEffect(() => {
    api<{ uoms: Array<{ code: string; name: string }> }>('GET', '/api/v1/uoms')
      .then((r) => setUoms(r.uoms))
      .catch(() => setUoms([]));
  }, []);

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

  if (!product && !error)
    return (
      <div className="page">
        <LoadingState text="Učitavanje artikla…" />
      </div>
    );

  return (
    <main className="page">
      <p style={{ margin: '0 0 8px' }}>
        <Link href="/catalog">← Artikli</Link>
      </p>
      {error ? <ErrorState text={error} /> : null}
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
                {PRODUCT_LABEL[product.status]}
              </span>{' '}
              {product.skus.length > 0 ? (
                <Link href="/inventory">Zalihe ovog artikla →</Link>
              ) : null}
            </div>
            {product.status === 'DRAFT' && can('product.publish') ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() => api('POST', `/api/v1/products/${product.id}/publish`), 'Objavljeno.')
                }
                type="button"
              >
                Objavi artikal
              </button>
            ) : null}
            {product.status !== 'ARCHIVED' && can('product.publish') ? (
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                disabled={busy}
                title="Sve SKU jedinice moraju prvo biti ukinute"
                onClick={() =>
                  run(() => api('POST', `/api/v1/products/${product.id}/archive`), 'Arhivirano.')
                }
                type="button"
              >
                Arhiviraj artikal
              </button>
            ) : null}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>SKU jedinice</h2>
            {product.skus.length === 0 ? (
              <EmptyState text="Još nema SKU jedinica — dodajte prvu prodajnu jedinicu." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Šifra</th>
                    <th>Naziv</th>
                    <th>Osnovna JM</th>
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
                        <span className={`badge ${SKU_BADGE[s.status]}`}>
                          {SKU_LABEL[s.status]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.status === 'DRAFT' && can('product.publish') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => api('POST', `/api/v1/skus/${s.id}/activate`),
                                `SKU ${s.code} je aktiviran.`,
                              )
                            }
                            type="button"
                          >
                            Aktiviraj
                          </button>
                        ) : null}
                        {can('product.manage') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            title="Praćenje lotova i rok trajanja (FEFO)"
                            onClick={() => {
                              const answer = window.prompt(
                                'Rok trajanja u danima za praćenje lotova (prazno isključuje praćenje)',
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
                                  ? `SKU ${s.code} se prati po lotovima (rok trajanja ${days} dana).`
                                  : `Praćenje lotova je isključeno za ${s.code}.`,
                              );
                            }}
                            type="button"
                          >
                            Politika lotova
                          </button>
                        ) : null}{' '}
                        {s.status === 'ACTIVE' && can('product.manage') ? (
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => api('POST', `/api/v1/skus/${s.id}/discontinue`),
                                `SKU ${s.code} je ukinut.`,
                              )
                            }
                            type="button"
                          >
                            Ukini
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
                    `SKU ${skuCode} je kreiran (nacrt).`,
                  ).then(() => {
                    setSkuCode('');
                    setSkuName('');
                  });
                }}
              >
                <h2>Nova SKU jedinica</h2>
                <label className="label">Šifra</label>
                <input
                  className="input mono"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  required
                />
                <label className="label">Naziv</label>
                <input
                  className="input"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  required
                />
                <label className="label">Osnovna jedinica mjere</label>
                {uoms.length > 0 ? (
                  <select
                    className="input"
                    value={baseUom}
                    onChange={(e) => setBaseUom(e.target.value)}
                    required
                  >
                    {uoms.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={baseUom}
                    onChange={(e) => setBaseUom(e.target.value)}
                    required
                  />
                )}
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Dodaj SKU
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
                    'Barkod je dodijeljen.',
                  ).then(() => setBarcodeValue(''));
                }}
              >
                <h2>Dodijeli barkod</h2>
                <label className="label">SKU</label>
                <select
                  className="select"
                  value={barcodeSku}
                  onChange={(e) => setBarcodeSku(e.target.value)}
                  required
                >
                  <option value="">Odaberite SKU…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <label className="label">Vrijednost barkoda</label>
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
                  Dodijeli
                </button>
              </form>
            ) : null}
          </div>

          {can('collab.use') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Mediji</h2>
              <p className="muted">
                Fotografije artikla — prikazane ovdje i pohranjene uz artikal.
              </p>
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
                <EmptyState text="Još nema fotografija." />
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
              <h2>Logistika</h2>
              <p className="muted">
                Težina i dimenzije po osnovnoj jedinici — ukupne vrijednosti narudžbi se računaju iz
                ovoga.
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
                  placeholder="D cm"
                  value={logL}
                  onChange={(e) => setLogL(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Š cm"
                  value={logW}
                  onChange={(e) => setLogW(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="V cm"
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
                      'Logistika je sačuvana.',
                    )
                  }
                >
                  Sačuvaj
                </button>
              </div>
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Pakovanje</h2>
              <p className="muted">
                Nivoi pakovanja iznad osnovne jedinice — barkod pakovanja se skenira direktno na SKU
                sa svojim množiteljem.
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
                  placeholder="Naziv pakovanja"
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  type="number"
                  min="2"
                  step="any"
                  placeholder="Jedinice"
                  value={packUnits}
                  onChange={(e) => setPackUnits(e.target.value)}
                />
                <input
                  className="input mono"
                  style={{ maxWidth: 140 }}
                  placeholder="Barkod (opciono)"
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
                    }, 'Nivo pakovanja je dodan.')
                  }
                >
                  Dodaj pakovanje
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
                          }, 'Nivo pakovanja je uklonjen.')
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
              <h2>Zamjene</h2>
              <p className="muted">
                Alternative koje se nude kada SKU nije dostupan (prikazuju se na linijama u
                čekanju).
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
                  <option value="">Primarni SKU…</option>
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
                  <option value="">Zamjena…</option>
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
                    }, 'Zamjena je dodana.')
                  }
                >
                  Dodaj zamjenu
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
                          }, 'Zamjena je uklonjena.')
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
              <h2>Komplet (bundle)</h2>
              <p className="muted">
                Komplet SKU se prodaje kao jedna stavka, a sastavlja se od komponentnih SKU jedinica
                — sastavljiva količina se računa iz zaliha komponenti.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={bundleSku}
                  onChange={(e) => {
                    const skuId = e.target.value;
                    setBundleSku(skuId);
                    setBundle(null);
                    if (skuId) {
                      api<{
                        components: Array<{
                          id: string;
                          componentCode: string;
                          quantity: string;
                          available: string;
                        }>;
                        buildable: number;
                      }>('GET', `/api/v1/skus/${skuId}/bundle`)
                        .then((r) => setBundle(r))
                        .catch(() => setBundle(null));
                    }
                  }}
                >
                  <option value="">SKU kompleta…</option>
                  {product.skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={bundleComp}
                  onChange={(e) => setBundleComp(e.target.value)}
                >
                  <option value="">Komponenta…</option>
                  {product.skus
                    .filter((s) => s.id !== bundleSku)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                      </option>
                    ))}
                </select>
                <input
                  className="input"
                  style={{ maxWidth: 70 }}
                  type="number"
                  min="0.000001"
                  step="any"
                  title="Količina po kompletu"
                  value={bundleQty}
                  onChange={(e) => setBundleQty(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !bundleSku || !bundleComp}
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await api('POST', `/api/v1/skus/${bundleSku}/bundle`, {
                        componentSkuId: bundleComp,
                        quantity: Number(bundleQty),
                      });
                      const r = await api<{
                        components: Array<{
                          id: string;
                          componentCode: string;
                          quantity: string;
                          available: string;
                        }>;
                        buildable: number;
                      }>('GET', `/api/v1/skus/${bundleSku}/bundle`);
                      setBundle(r);
                    }, 'Komponenta je dodana.')
                  }
                >
                  Dodaj komponentu
                </button>
              </div>
              {bundle && bundle.components.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    Moguće sastaviti sada: <strong>{bundle.buildable}</strong>{' '}
                    {bundle.buildable > 0 ? (
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 8 }}
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          const qty = window.prompt('Koliko kompleta sastaviti?', '1');
                          if (!qty) return;
                          void run(async () => {
                            const warehouses = await api<{
                              warehouses: Array<{ id: string }>;
                            }>('GET', '/api/v1/warehouses');
                            const warehouseId = warehouses.warehouses[0]?.id;
                            if (!warehouseId) throw new Error('Nema skladišta');
                            await api('POST', `/api/v1/skus/${bundleSku}/bundle/assemble`, {
                              warehouseId,
                              quantity: Number(qty),
                              assembleKey: `ui-${Date.now()}-${Math.random()
                                .toString(36)
                                .slice(2, 8)}`,
                            });
                          }, 'Kompleti su sastavljeni — zaliha je premještena.');
                        }}
                      >
                        Sastavi
                      </button>
                    ) : null}
                  </p>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {bundle.components.map((c) => (
                      <span key={c.id} className="badge mono">
                        {c.quantity} × {c.componentCode} (dost. {c.available}){' '}
                        <button
                          className="btn btn-sm"
                          style={{ marginLeft: 4, padding: '0 6px' }}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api('POST', `/api/v1/skus/${bundleSku}/bundle/${c.id}/remove`);
                              setBundle((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      components: prev.components.filter((x) => x.id !== c.id),
                                    }
                                  : prev,
                              );
                            }, 'Komponenta je uklonjena.')
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Serijski brojevi</h2>
              <p className="muted">
                Serijski praćene SKU jedinice vode po jedan zapis za svaku fizičku jedinicu, s punim
                životnim ciklusom (na zalihi, poslano, vraćeno, otpisano).
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={serialSku}
                  onChange={(e) => {
                    const skuId = e.target.value;
                    setSerialSku(skuId);
                    setSerialData(null);
                    if (skuId) {
                      api<{
                        policy: string;
                        serials: Array<{ id: string; serial: string; status: string }>;
                      }>('GET', `/api/v1/skus/${skuId}/serials`)
                        .then((r) => setSerialData(r))
                        .catch(() => setSerialData(null));
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
                {serialData ? (
                  <select
                    className="select"
                    style={{ maxWidth: 140 }}
                    value={serialData.policy}
                    onChange={(e) =>
                      run(async () => {
                        await api('POST', `/api/v1/skus/${serialSku}/serial-policy`, {
                          policy: e.target.value,
                        });
                        const r = await api<{
                          policy: string;
                          serials: Array<{ id: string; serial: string; status: string }>;
                        }>('GET', `/api/v1/skus/${serialSku}/serials`);
                        setSerialData(r);
                      }, 'Politika serijskih brojeva je ažurirana.')
                    }
                  >
                    <option value="NONE">Bez serijskih brojeva</option>
                    <option value="OPTIONAL">Opcionalno</option>
                    <option value="REQUIRED">Obavezno</option>
                  </select>
                ) : null}
                {serialData && serialData.policy !== 'NONE' ? (
                  <>
                    <input
                      className="input"
                      style={{ maxWidth: 220 }}
                      placeholder="Serijski brojevi, odvojeni zarezom"
                      value={serialInput}
                      onChange={(e) => setSerialInput(e.target.value)}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy || !serialInput.trim()}
                      type="button"
                      onClick={() =>
                        run(async () => {
                          await api('POST', `/api/v1/skus/${serialSku}/serials`, {
                            serials: serialInput
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          });
                          setSerialInput('');
                          const r = await api<{
                            policy: string;
                            serials: Array<{ id: string; serial: string; status: string }>;
                          }>('GET', `/api/v1/skus/${serialSku}/serials`);
                          setSerialData(r);
                        }, 'Serijski brojevi su registrovani.')
                      }
                    >
                      Registruj
                    </button>
                  </>
                ) : null}
              </div>
              {serialData && serialData.serials.length > 0 ? (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {serialData.serials.slice(0, 30).map((sn) => (
                    <span key={sn.id} className="badge mono" title={sn.status}>
                      {sn.serial} · {sn.status}
                      {sn.status === 'IN_STOCK' ? (
                        <button
                          className="btn btn-sm"
                          style={{ marginLeft: 4, padding: '0 6px' }}
                          type="button"
                          disabled={busy}
                          title="Označi kao poslano"
                          onClick={() =>
                            run(async () => {
                              await api('POST', `/api/v1/skus/serials/${sn.id}/status`, {
                                status: 'SHIPPED',
                              });
                              const r = await api<{
                                policy: string;
                                serials: Array<{ id: string; serial: string; status: string }>;
                              }>('GET', `/api/v1/skus/${serialSku}/serials`);
                              setSerialData(r);
                            }, 'Serijski broj je označen kao poslan.')
                          }
                        >
                          →
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Kategorije i varijante</h2>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label className="label">Kategorija</label>
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
                          'Artikal je dodijeljen kategoriji.',
                        );
                      }
                    }}
                  >
                    <option value="">Dodijeli kategoriju…</option>
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
                    const code = window.prompt('Šifra nove kategorije (npr. LIGHTING)');
                    if (!code) return;
                    const name = window.prompt('Naziv kategorije') ?? code;
                    void run(
                      () => api('POST', '/api/v1/catalog/categories', { code, name }),
                      'Kategorija je kreirana.',
                    );
                  }}
                  type="button"
                >
                  Nova kategorija
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
                  Generator varijanti — jedan SKU po kombinaciji (npr. boja × veličina).
                </div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <input
                    className="input mono"
                    style={{ maxWidth: 100 }}
                    value={axis1}
                    onChange={(e) => setAxis1(e.target.value)}
                    placeholder="osa 1"
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={values1}
                    onChange={(e) => setValues1(e.target.value)}
                    placeholder="crvena, plava, crna"
                  />
                  <input
                    className="input mono"
                    style={{ maxWidth: 100 }}
                    value={axis2}
                    onChange={(e) => setAxis2(e.target.value)}
                    placeholder="osa 2 (opciono)"
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
                        'Varijante su generisane.',
                      );
                    }}
                    type="button"
                  >
                    Generiši varijante
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {can('product.manage') ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Sadržaj po kanalu</h2>
              <p className="muted">
                Komercijalni tekst po kanalu nad jednim kanonskim SKU (PIM-009) — webshop, POS i
                marketplace oglasi mogu se razlikovati bez dupliranja artikla.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="select"
                  style={{ maxWidth: 170 }}
                  value={ccSku}
                  onChange={(e) => {
                    const skuId = e.target.value;
                    setCcSku(skuId);
                    setCcList([]);
                    if (skuId) {
                      api<{
                        content: Array<{
                          channel: string;
                          title: string;
                          description: string | null;
                        }>;
                      }>('GET', `/api/v1/skus/${skuId}/channel-content`)
                        .then((r) => setCcList(r.content))
                        .catch(() => setCcList([]));
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
                  className="input mono"
                  style={{ maxWidth: 130 }}
                  value={ccChannel}
                  onChange={(e) => setCcChannel(e.target.value)}
                  placeholder="kanal"
                />
                <input
                  className="input"
                  style={{ maxWidth: 220 }}
                  value={ccTitle}
                  onChange={(e) => setCcTitle(e.target.value)}
                  placeholder="Naslov za kanal"
                />
                <input
                  className="input"
                  style={{ maxWidth: 260 }}
                  value={ccDesc}
                  onChange={(e) => setCcDesc(e.target.value)}
                  placeholder="Opis (opciono)"
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !ccSku || !ccChannel || !ccTitle.trim()}
                  onClick={() =>
                    run(async () => {
                      await api('PUT', `/api/v1/skus/${ccSku}/channel-content/${ccChannel}`, {
                        title: ccTitle.trim(),
                        ...(ccDesc.trim() ? { description: ccDesc.trim() } : {}),
                      });
                      const r = await api<{
                        content: Array<{
                          channel: string;
                          title: string;
                          description: string | null;
                        }>;
                      }>('GET', `/api/v1/skus/${ccSku}/channel-content`);
                      setCcList(r.content);
                      setCcTitle('');
                      setCcDesc('');
                    }, 'Sadržaj kanala je sačuvan.')
                  }
                  type="button"
                >
                  Sačuvaj sadržaj
                </button>
              </div>
              {ccList.length > 0 ? (
                <table className="table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Kanal</th>
                      <th>Naslov</th>
                      <th>Opis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ccList.map((c) => (
                      <tr key={c.channel}>
                        <td className="mono">{c.channel}</td>
                        <td>{c.title}</td>
                        <td className="muted">{c.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
