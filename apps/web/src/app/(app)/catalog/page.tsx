'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
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

export default function CatalogPage() {
  const { can } = useApp();
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
      setNotice(`Product ${created.code} created (draft).`);
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
      <h1>Catalog</h1>
      <p className="page-sub">Products and sellable SKUs (product information management).</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="spread" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Products</h2>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Search…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                load(e.target.value);
              }}
            />
          </div>
          {products === null ? <div className="loading">Loading catalog…</div> : null}
          {products && products.length === 0 ? (
            <div className="empty">No products found.</div>
          ) : null}
          {products && products.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">
                      <Link href={`/catalog/${p.id}`}>{p.code}</Link>
                    </td>
                    <td>{p.name}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        {can('product.manage') ? (
          <form className="card" onSubmit={createProduct}>
            <h2>New product</h2>
            <label className="label">Code</label>
            <input
              className="input mono"
              placeholder="e.g. WIDGET-01"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <label className="label">Name</label>
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
              {busy ? 'Creating…' : 'Create product'}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
