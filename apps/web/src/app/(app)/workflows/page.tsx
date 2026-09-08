'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

/**
 * Workflow designer (WF-001): definitions are designed as states and
 * transitions, published as immutable versions, and instances move
 * through them — all server-governed; this page is only the pencil.
 */

interface StateRow {
  name: string;
  terminal: boolean;
}

interface TransitionRow {
  from: string;
  to: string;
  trigger: string;
}

interface DefinitionRow {
  key: string;
  name: string;
  version: number;
  instances: number;
  spec: { initial: string; states: StateRow[]; transitions: TransitionRow[] };
}

export default function WorkflowsPage() {
  const { can } = useApp();
  const [definitions, setDefinitions] = useState<DefinitionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [states, setStates] = useState<StateRow[]>([
    { name: 'DRAFT', terminal: false },
    { name: 'DONE', terminal: true },
  ]);
  const [transitions, setTransitions] = useState<TransitionRow[]>([
    { from: 'DRAFT', to: 'DONE', trigger: 'finish' },
  ]);

  const load = useCallback(() => {
    api<{ workflows: DefinitionRow[] }>('GET', '/api/v1/workflows')
      .then((r) => setDefinitions(r.workflows))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNotice(message);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Workflows</h1>
      <p className="muted">
        States, transitions and triggers — published as immutable versions; running instances stay
        pinned to the version they started on.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Published workflows</h2>
        {definitions === null ? (
          <p className="muted">Loading…</p>
        ) : definitions.length === 0 ? (
          <p className="muted">Nothing published yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Version</th>
                <th>States</th>
                <th>Instances</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((d) => (
                <tr key={d.key}>
                  <td className="mono">{d.key}</td>
                  <td>{d.name}</td>
                  <td>v{d.version}</td>
                  <td className="muted">{d.spec.states.map((s) => s.name).join(' → ')}</td>
                  <td>{d.instances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {can('workflow.publish') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Designer</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input
              className="input mono"
              style={{ maxWidth: 180 }}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="workflow-key"
            />
            <input
              className="input"
              style={{ maxWidth: 240 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
            />
          </div>

          <div className="muted" style={{ fontSize: 13, margin: '10px 0 6px' }}>
            States (first is initial; terminal states complete the instance)
          </div>
          {states.map((state, index) => (
            <div className="row" key={index} style={{ marginBottom: 6 }}>
              <input
                className="input mono"
                style={{ maxWidth: 200 }}
                value={state.name}
                onChange={(e) => {
                  const next = [...states];
                  next[index] = { ...state, name: e.target.value.toUpperCase() };
                  setStates(next);
                }}
                placeholder="STATE_NAME"
              />
              <label className="muted" style={{ fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={state.terminal}
                  onChange={(e) => {
                    const next = [...states];
                    next[index] = { ...state, terminal: e.target.checked };
                    setStates(next);
                  }}
                />{' '}
                terminal
              </label>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setStates(states.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setStates([...states, { name: '', terminal: false }])}
          >
            + state
          </button>

          <div className="muted" style={{ fontSize: 13, margin: '12px 0 6px' }}>
            Transitions
          </div>
          {transitions.map((transition, index) => (
            <div className="row" key={index} style={{ marginBottom: 6 }}>
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={transition.from}
                onChange={(e) => {
                  const next = [...transitions];
                  next[index] = { ...transition, from: e.target.value };
                  setTransitions(next);
                }}
              >
                {states.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="muted">→</span>
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={transition.to}
                onChange={(e) => {
                  const next = [...transitions];
                  next[index] = { ...transition, to: e.target.value };
                  setTransitions(next);
                }}
              >
                {states.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                className="input mono"
                style={{ maxWidth: 160 }}
                value={transition.trigger}
                onChange={(e) => {
                  const next = [...transitions];
                  next[index] = { ...transition, trigger: e.target.value };
                  setTransitions(next);
                }}
                placeholder="trigger"
              />
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setTransitions(transitions.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn btn-sm"
            type="button"
            onClick={() =>
              setTransitions([
                ...transitions,
                {
                  from: states[0]?.name ?? '',
                  to: states[states.length - 1]?.name ?? '',
                  trigger: '',
                },
              ])
            }
          >
            + transition
          </button>

          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              disabled={busy || !key || !name || states.length === 0 || transitions.length === 0}
              type="button"
              onClick={() =>
                run(
                  () =>
                    api('POST', '/api/v1/workflows/publish', {
                      key,
                      name,
                      spec: {
                        initial: states[0]?.name,
                        states,
                        transitions,
                      },
                    }),
                  'Workflow published.',
                )
              }
            >
              Publish version
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
