'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { DataTable, ErrorState, LoadingState } from '../../../components/ui';
import { useApp } from '../app-shell';

interface ProductView {
  id: string;
  code: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

const STATUS_BADGE: Record<ProductView['status'], string> = {
  DRAFT: 'badge-warn',
  PUBLISHED: 'badge-ok',
  ARCHIVED: '',
};

const STATUS_LABEL: Record<ProductView['status'], string> = {
  DRAFT: 'Nacrt',
  PUBLISHED: 'Objavljen',
  ARCHIVED: 'Arhiviran',
};

export default function CatalogPage() {
  const { can } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((q: string) => {
    api<{ products: ProductView[] }>('GET', `/api/v1/products/search?q=${encodeURIComponent(q)}`)
      .then((r) => {
        setProducts(r.products);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api<ProductView>('POST', '/api/v1/products', { code, name });
      setNotice(`Artikal ${created.code} je kreiran (nacrt).`);
      setCode('');
      setName('');
      load(query);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Artikli</h1>
      <p className="page-sub">Artikli i prodajne jedinice (SKU) — upravljanje matičnim podacima.</p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="spread" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Artikli</h2>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Serverska pretraga…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                load(e.target.value);
              }}
            />
          </div>
          {products === null ? <LoadingState text="Učitavanje artikala…" /> : null}
          {products ? (
            <DataTable<ProductView>
              columns={[
                {
                  key: 'code',
                  header: 'Šifra',
                  render: (p) => (
                    <span className="mono">
                      <Link href={`/catalog/${p.id}`}>{p.code}</Link>
                    </span>
                  ),
                  text: (p) => p.code,
                },
                {
                  key: 'name',
                  header: 'Naziv',
                  render: (p) => p.name,
                  text: (p) => p.name,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (p) => (
                    <span className={`badge ${STATUS_BADGE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  ),
                  text: (p) => STATUS_LABEL[p.status],
                },
              ]}
              rows={products}
              rowKey={(p) => p.id}
              onRowClick={(p) => router.push(`/catalog/${p.id}`)}
              searchPlaceholder="Brza pretraga u listi…"
              pageSize={10}
              emptyText="Nijedan artikal nije pronađen."
            />
          ) : null}
        </div>

        {can('product.manage') ? (
          <form className="card" onSubmit={createProduct}>
            <h2>Novi artikal</h2>
            <label className="label">Šifra</label>
            <input
              className="input mono"
              placeholder="npr. WIDGET-01"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <label className="label">Naziv</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              disabled={busy}
              type="submit"
            >
              {busy ? 'Kreiranje…' : 'Kreiraj artikal'}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
