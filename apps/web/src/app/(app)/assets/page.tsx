'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface AssetView {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  status: 'IN_SERVICE' | 'UNDER_MAINTENANCE' | 'RETIRED';
  value: string | null;
}

const NEXT: Record<string, Array<{ label: string; to: string }>> = {
  IN_SERVICE: [
    { label: 'To maintenance', to: 'UNDER_MAINTENANCE' },
    { label: 'Retire', to: 'RETIRED' },
  ],
  UNDER_MAINTENANCE: [
    { label: 'Back in service', to: 'IN_SERVICE' },
    { label: 'Retire', to: 'RETIRED' },
  ],
  RETIRED: [],
};

export default function AssetsPage() {
  const { can } = useApp();
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [serial, setSerial] = useState('');
  const [value, setValue] = useState('');

  const load = useCallback(() => {
    api<{ assets: AssetView[] }>('GET', '/api/v1/assets')
      .then((r) => {
        setAssets(r.assets);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Assets</h1>
      <p className="page-sub">Machine and equipment registry with an audited service lifecycle.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Registry</h2>
          {assets === null ? <div className="loading">Loading…</div> : null}
          {assets && assets.length === 0 ? <div className="empty">No assets yet.</div> : null}
          {(assets ?? []).map((a) => (
            <div key={a.id} className="row spread" style={{ marginBottom: 8 }}>
              <span>
                <strong className="mono">{a.assetNumber}</strong> {a.name}{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {a.category}
                  {a.serialNumber ? ` · SN ${a.serialNumber}` : ''}
                  {a.value ? ` · ${a.value}` : ''}
                </span>
              </span>
              <span>
                <span
                  className={`badge ${
                    a.status === 'IN_SERVICE'
                      ? 'badge-ok'
                      : a.status === 'UNDER_MAINTENANCE'
                        ? 'badge-warn'
                        : ''
                  }`}
                >
                  {a.status}
                </span>{' '}
                {can('asset.manage')
                  ? (NEXT[a.status] ?? []).map((n) => (
                      <button
                        key={n.to}
                        className="btn btn-sm"
                        style={{ marginLeft: 4 }}
                        disabled={busy}
                        type="button"
                        onClick={() =>
                          run(
                            () =>
                              api('POST', `/api/v1/assets/${a.id}/transition`, { status: n.to }),
                            'Asset updated.',
                          )
                        }
                      >
                        {n.label}
                      </button>
                    ))
                  : null}
              </span>
            </div>
          ))}
        </div>

        {can('asset.manage') ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('POST', '/api/v1/assets', {
                  name,
                  category,
                  ...(serial ? { serialNumber: serial } : {}),
                  ...(value ? { value: Number(value) } : {}),
                });
                setName('');
                setSerial('');
                setValue('');
              }, 'Asset registered.');
            }}
          >
            <h2>Register asset</h2>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <label className="label">Category</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="machine, vehicle, tool…"
              required
            />
            <label className="label">Serial number (optional)</label>
            <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />
            <label className="label">Value (optional)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              disabled={busy}
              type="submit"
            >
              Add asset
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
