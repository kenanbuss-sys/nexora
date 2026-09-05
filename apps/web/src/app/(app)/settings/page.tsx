'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface EffectiveConfig {
  version: number;
  config: {
    branding?: {
      name?: string;
      accentColor?: string;
      accentColor2?: string;
    };
    [key: string]: unknown;
  };
}

interface VersionRow {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const { can } = useApp();
  const [config, setConfig] = useState<EffectiveConfig | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [name, setName] = useState('');
  const [accentColor, setAccentColor] = useState('#4f46e5');
  const [accentColor2, setAccentColor2] = useState('#7c3aed');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<EffectiveConfig>('GET', '/api/v1/tenant/configuration')
      .then((c) => {
        setConfig(c);
        const branding = c.config?.branding ?? {};
        if (branding.name) setName(branding.name);
        if (branding.accentColor) setAccentColor(branding.accentColor);
        if (branding.accentColor2) setAccentColor2(branding.accentColor2);
      })
      .catch((e) => setError(errorText(e)));
    api<{ versions: VersionRow[] }>('GET', '/api/v1/tenant/configuration/history')
      .then((r) => setVersions(r.versions))
      .catch(() => setVersions([]));
  }, []);

  useEffect(load, [load]);

  async function publish() {
    if (accentColor && !HEX.test(accentColor)) {
      setError('Accent color must be a #rrggbb value');
      return;
    }
    if (accentColor2 && !HEX.test(accentColor2)) {
      setError('Second accent color must be a #rrggbb value');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const base = config?.config && typeof config.config === 'object' ? { ...config.config } : {};
      await api('POST', '/api/v1/tenant/configuration', {
        config: {
          ...base,
          branding: { name: name.trim(), accentColor, accentColor2 },
        },
      });
      setNotice('Branding published — refresh to see it everywhere.');
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="page-sub">
        White-label branding for this workspace — the name and colors every user sees. Changes are
        published as immutable configuration versions.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Branding</h2>
          <label className="label" htmlFor="brand-name">
            Workspace name
          </label>
          <input
            id="brand-name"
            className="input"
            placeholder="e.g. Adria Manufacturing"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="label" htmlFor="brand-accent">
            Accent color
          </label>
          <div className="row">
            <input
              id="brand-accent"
              type="color"
              value={HEX.test(accentColor) ? accentColor : '#4f46e5'}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 44, height: 34, padding: 2, border: 'none', background: 'none' }}
            />
            <input
              className="input mono"
              style={{ maxWidth: 120 }}
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
          </div>
          <label className="label" htmlFor="brand-accent2">
            Second accent (gradients)
          </label>
          <div className="row">
            <input
              id="brand-accent2"
              type="color"
              value={HEX.test(accentColor2) ? accentColor2 : '#7c3aed'}
              onChange={(e) => setAccentColor2(e.target.value)}
              style={{ width: 44, height: 34, padding: 2, border: 'none', background: 'none' }}
            />
            <input
              className="input mono"
              style={{ maxWidth: 120 }}
              value={accentColor2}
              onChange={(e) => setAccentColor2(e.target.value)}
            />
          </div>
          <div
            style={{
              margin: '14px 0',
              padding: '12px 14px',
              borderRadius: 10,
              color: '#fff',
              fontWeight: 650,
              background: `linear-gradient(135deg, ${HEX.test(accentColor) ? accentColor : '#4f46e5'}, ${HEX.test(accentColor2) ? accentColor2 : '#7c3aed'})`,
            }}
          >
            {name.trim() || 'NexoraOS'} — preview
          </div>
          {can('configuration.publish') ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
              {busy ? 'Publishing…' : 'Publish branding'}
            </button>
          ) : (
            <p className="muted">Publishing needs the configuration.publish permission.</p>
          )}
        </div>

        <div className="card">
          <h2>Configuration history</h2>
          {versions.length === 0 ? (
            <div className="empty">No published versions yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.version}>
                    <td className="mono">v{v.version}</td>
                    <td>{new Date(v.publishedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
