'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface DeviceView {
  id: string;
  code: string;
  name: string;
  deviceType: string;
  status: 'ENROLLED' | 'ACTIVE' | 'SUSPENDED';
  lastSeenAt: string | null;
}

interface ScanEventView {
  id: string;
  deviceId: string;
  kind: string;
  value: string;
  receivedAt: string;
  resolvedSkuId: string | null;
}

const STATUS_BADGE: Record<DeviceView['status'], string> = {
  ACTIVE: 'badge-ok',
  ENROLLED: 'badge-warn',
  SUSPENDED: 'badge-danger',
};

export default function DevicesPage() {
  const { can } = useApp();
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [events, setEvents] = useState<ScanEventView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [deviceType, setDeviceType] = useState('SCANNER');

  const load = useCallback(() => {
    api<{ devices: DeviceView[] }>('GET', '/api/v1/devices')
      .then((r) => {
        setDevices(r.devices);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    if (can('verification.audit')) {
      api<{ events: ScanEventView[] }>('GET', '/api/v1/scan-events')
        .then((r) => setEvents(r.events))
        .catch(() => setEvents([]));
    }
    // eslint-disable-next-line
  }, []);

  useEffect(load, [load]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setNewToken(null);
    try {
      const created = await api<DeviceView & { enrollmentToken: string }>(
        'POST',
        '/api/v1/devices',
        { code, name, deviceType },
      );
      setNotice(`Device ${created.code} registered.`);
      setNewToken(created.enrollmentToken);
      setCode('');
      setName('');
      load();
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await api('POST', `/api/v1/devices/${id}/revoke`, { reason: 'Revoked from console' });
      load();
    } catch (err: unknown) {
      setError(errorText(err));
    }
  }

  return (
    <main className="page">
      <h1>Devices</h1>
      <p className="page-sub">
        Scanners, tablets and printers. Hardware stays behind adapters — the platform tracks
        identity, capabilities and liveness.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {newToken ? (
        <div className="alert alert-ok">
          One-time enrollment token (copy it now — it is never shown again):{' '}
          <span className="mono">{newToken}</span>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <h2>Registry</h2>
          {devices === null ? <div className="loading">Loading devices…</div> : null}
          {devices && devices.length === 0 ? (
            <div className="empty">No devices yet — register the first scanner.</div>
          ) : null}
          {devices && devices.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.code}</td>
                    <td>{d.deviceType}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="muted">
                      {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {d.status !== 'SUSPENDED' && can('device.revoke') ? (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => void revoke(d.id)}
                          type="button"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div>
          {can('device.enroll') ? (
            <form className="card" onSubmit={register}>
              <h2>Register device</h2>
              <label className="label">Code</label>
              <input
                className="input mono"
                placeholder="e.g. HH-01"
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
              <label className="label">Type</label>
              <select
                className="select"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
              >
                <option value="SCANNER">Scanner</option>
                <option value="TABLET">Tablet</option>
                <option value="PRINTER">Printer</option>
                <option value="SCALE">Scale</option>
                <option value="OTHER">Other</option>
              </select>
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Register
              </button>
            </form>
          ) : null}

          {can('verification.audit') ? (
            <div className="card">
              <h2>Recent scans</h2>
              {events.length === 0 ? (
                <div className="empty">No scan events yet.</div>
              ) : (
                <table className="table">
                  <tbody>
                    {events.slice(0, 12).map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <span className="badge">{ev.kind}</span>
                        </td>
                        <td className="mono">{ev.value}</td>
                        <td>
                          {ev.resolvedSkuId ? <span className="badge badge-ok">SKU</span> : ''}
                        </td>
                        <td className="muted">{new Date(ev.receivedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
