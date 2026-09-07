'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  required: boolean;
  options?: string[];
}

interface ObjectDef {
  id: string;
  key: string;
  name: string;
  status: string;
  fields: FieldDef[];
  records: number;
}

interface RecordRow {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export default function ObjectsPage() {
  const { can } = useApp();
  const [objects, setObjects] = useState<ObjectDef[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [draftFields, setDraftFields] = useState<FieldDef[]>([
    { key: 'naziv', label: 'Naziv', type: 'text', required: true },
  ]);

  const load = useCallback(() => {
    api<{ objects: ObjectDef[] }>('GET', '/api/v1/custom-objects')
      .then((r) => {
        setObjects(r.objects);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!selected) {
      setRecords([]);
      return;
    }
    api<{ records: RecordRow[] }>('GET', `/api/v1/custom-objects/${selected}/records`)
      .then((r) => setRecords(r.records))
      .catch(() => setRecords([]));
  }, [selected, notice]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const current = objects.find((o) => o.key === selected);

  function coerce(field: FieldDef, raw: string): unknown {
    if (raw === '') return undefined;
    if (field.type === 'number') return Number(raw);
    if (field.type === 'boolean') return raw === 'true';
    return raw;
  }

  return (
    <main className="page">
      <h1>Custom objects</h1>
      <p className="page-sub">
        Tenant-defined objects and forms — fields described as data, records validated server-side.
        Extension without a code fork.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Objects</h2>
            {objects.length === 0 ? <div className="empty">No custom objects yet.</div> : null}
            {objects.map((o) => (
              <div key={o.id} className="row spread" style={{ marginBottom: 6 }}>
                <span>
                  <button
                    className={`btn btn-sm ${selected === o.key ? 'btn-primary' : ''}`}
                    type="button"
                    onClick={() => setSelected(o.key === selected ? '' : o.key)}
                  >
                    {o.name}
                  </button>{' '}
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {o.key} · {o.records} records
                  </span>
                </span>
                <span className={`badge ${o.status === 'ACTIVE' ? 'badge-ok' : 'badge-warn'}`}>
                  {o.status}
                </span>
              </div>
            ))}
          </div>

          {can('configuration.publish') ? (
            <form
              className="card"
              style={{ marginTop: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/custom-objects', {
                      key: newKey,
                      name: newName,
                      fields: draftFields,
                    }),
                  'Object defined.',
                ).then(() => {
                  setNewKey('');
                  setNewName('');
                });
              }}
            >
              <h2>Form builder</h2>
              <label className="label">Key (snake_case)</label>
              <input
                className="input mono"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                required
              />
              <label className="label">Name</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <label className="label">Fields</label>
              {draftFields.map((f, i) => (
                <div key={i} className="row" style={{ marginBottom: 6 }}>
                  <input
                    className="input mono"
                    style={{ width: 110 }}
                    placeholder="key"
                    value={f.key}
                    onChange={(e) => {
                      const next = [...draftFields];
                      next[i] = { ...f, key: e.target.value };
                      setDraftFields(next);
                    }}
                    required
                  />
                  <input
                    className="input"
                    style={{ width: 120 }}
                    placeholder="Label"
                    value={f.label}
                    onChange={(e) => {
                      const next = [...draftFields];
                      next[i] = { ...f, label: e.target.value };
                      setDraftFields(next);
                    }}
                  />
                  <select
                    className="input"
                    value={f.type}
                    onChange={(e) => {
                      const next = [...draftFields];
                      next[i] = { ...f, type: e.target.value as FieldDef['type'] };
                      setDraftFields(next);
                    }}
                  >
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="date">date</option>
                    <option value="boolean">boolean</option>
                    <option value="select">select</option>
                  </select>
                  {f.type === 'select' ? (
                    <input
                      className="input"
                      style={{ width: 130 }}
                      placeholder="opt1,opt2"
                      value={(f.options ?? []).join(',')}
                      onChange={(e) => {
                        const next = [...draftFields];
                        next[i] = {
                          ...f,
                          options: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        };
                        setDraftFields(next);
                      }}
                    />
                  ) : null}
                  <label style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => {
                        const next = [...draftFields];
                        next[i] = { ...f, required: e.target.checked };
                        setDraftFields(next);
                      }}
                    />{' '}
                    req
                  </label>
                </div>
              ))}
              <div className="row" style={{ marginTop: 6 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() =>
                    setDraftFields([
                      ...draftFields,
                      { key: '', label: '', type: 'text', required: false },
                    ])
                  }
                >
                  Add field
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
                  Define object
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div>
          {current ? (
            <>
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data: Record<string, unknown> = {};
                  for (const field of current.fields) {
                    const value = coerce(field, form[field.key] ?? '');
                    if (value !== undefined) data[field.key] = value;
                  }
                  void run(
                    () => api('POST', `/api/v1/custom-objects/${current.key}/records`, { data }),
                    'Record saved.',
                  ).then(() => setForm({}));
                }}
              >
                <h2>{current.name}</h2>
                {current.fields.map((field) => (
                  <div key={field.key}>
                    <label className="label">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    {field.type === 'boolean' ? (
                      <select
                        className="input"
                        value={form[field.key] ?? ''}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      >
                        <option value="">—</option>
                        <option value="true">Da</option>
                        <option value="false">Ne</option>
                      </select>
                    ) : field.type === 'select' ? (
                      <select
                        className="input"
                        value={form[field.key] ?? ''}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      >
                        <option value="">—</option>
                        {(field.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        type={
                          field.type === 'number'
                            ? 'number'
                            : field.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        value={form[field.key] ?? ''}
                        onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Save record
                </button>
              </form>

              <div className="card" style={{ marginTop: 16 }}>
                <h2>Records</h2>
                {records.length === 0 ? <div className="empty">No records yet.</div> : null}
                {records.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          {current.fields.map((f) => (
                            <th key={f.key}>{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id}>
                            {current.fields.map((f) => (
                              <td key={f.key}>{String(r.data[f.key] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="card">
              <div className="empty">Select an object to open its form.</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
