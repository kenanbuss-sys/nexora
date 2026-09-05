'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface UserView {
  id: string;
  email: string;
  displayName: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
}

interface RoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  active: boolean;
  lastUsedAt: string | null;
}

interface SecurityEventView {
  id: string;
  eventType: string;
  subject: string | null;
  detail: string | null;
  createdAt: string;
}

const USER_BADGE: Record<UserView['status'], string> = {
  ACTIVE: 'badge-ok',
  INVITED: 'badge-warn',
  SUSPENDED: 'badge-danger',
};

export default function UsersPage() {
  const { can } = useApp();
  const [users, setUsers] = useState<UserView[] | null>(null);
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<{ hasPassword: boolean; mfaEnabled: boolean } | null>(null);
  const [mfaSecret, setMfaSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [idpSubject, setIdpSubject] = useState('');
  const [assignUser, setAssignUser] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKeyView[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventView[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyPermissions, setKeyPermissions] = useState('order.read, inventory.read');
  const [keyOnce, setKeyOnce] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ users: UserView[] }>('GET', '/api/v1/users')
      .then((r) => {
        setUsers(r.users);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    if (can('iam.role.manage')) {
      api<{ roles: RoleView[] }>('GET', '/api/v1/roles')
        .then((r) => setRoles(r.roles))
        .catch(() => setRoles([]));
    }
    if (can('iam.user.manage')) {
      api<{ apiKeys: ApiKeyView[] }>('GET', '/api/v1/iam/api-keys')
        .then((r) => setApiKeys(r.apiKeys))
        .catch(() => setApiKeys([]));
      api<{ events: SecurityEventView[] }>('GET', '/api/v1/iam/security-events')
        .then((r) => setSecurityEvents(r.events))
        .catch(() => setSecurityEvents([]));
    }
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api<{ hasPassword: boolean; mfaEnabled: boolean }>('GET', '/api/v1/auth/mfa')
      .then(setMfa)
      .catch(() => setMfa(null));
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

  return (
    <main className="page">
      <h1>Users &amp; roles</h1>
      <p className="page-sub">
        Access is default-deny: a user can do only what their roles explicitly grant.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Users</h2>
            {users === null ? <div className="loading">Loading users…</div> : null}
            {users && users.length === 0 ? <div className="empty">No users yet.</div> : null}
            {users && users.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.displayName}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`badge ${USER_BADGE[u.status]}`}>{u.status}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => {
                            const password = window.prompt(
                              `New password for ${u.email} (min 8 characters):`,
                            );
                            if (!password) return;
                            void run(
                              () => api('POST', `/api/v1/users/${u.id}/password`, { password }),
                              'Password set — the user must change it at first sign-in.',
                            );
                          }}
                        >
                          Set password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          {roles !== null ? (
            <div className="card">
              <h2>Roles</h2>
              {roles.length === 0 ? <div className="empty">No roles yet.</div> : null}
              {roles.map((r) => (
                <div key={r.id} style={{ marginBottom: 12 }}>
                  <strong>{r.name}</strong>
                  {r.description ? <span className="muted"> — {r.description}</span> : null}
                  <div className="row" style={{ marginTop: 4, gap: 6 }}>
                    {r.permissions.map((p) => (
                      <span key={p} className="badge mono" style={{ fontSize: 11 }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {can('iam.user.manage') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/users/invite', {
                      email,
                      displayName,
                      ...(idpSubject ? { idpSubject } : {}),
                    }),
                  `Invitation created for ${email}.`,
                ).then(() => {
                  setEmail('');
                  setDisplayName('');
                  setIdpSubject('');
                });
              }}
            >
              <h2>Invite user</h2>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="label">Display name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              <label className="label">Identity subject (dev mode)</label>
              <input
                className="input mono"
                placeholder="idp|someone"
                value={idpSubject}
                onChange={(e) => setIdpSubject(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Invite
              </button>
            </form>
          ) : null}

          {can('iam.role.manage') ? (
            <>
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/roles', {
                        name: roleName,
                        permissions: rolePermissions
                          .split(/[\s,]+/)
                          .map((p) => p.trim())
                          .filter(Boolean),
                      }),
                    `Role ${roleName} created.`,
                  ).then(() => {
                    setRoleName('');
                    setRolePermissions('');
                  });
                }}
              >
                <h2>New role</h2>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                />
                <label className="label">Permissions (comma or space separated)</label>
                <input
                  className="input mono"
                  placeholder="product.read, inventory.read"
                  value={rolePermissions}
                  onChange={(e) => setRolePermissions(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Create role
                </button>
              </form>

              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('POST', '/api/v1/roles/assign', {
                        userId: assignUser,
                        roleId: assignRole,
                      }),
                    'Role assigned.',
                  );
                }}
              >
                <h2>Assign role</h2>
                <label className="label">User</label>
                <select
                  className="select"
                  value={assignUser}
                  onChange={(e) => setAssignUser(e.target.value)}
                  required
                >
                  <option value="">Select user…</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
                </select>
                <label className="label">Role</label>
                <select
                  className="select"
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  required
                >
                  <option value="">Select role…</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  type="submit"
                >
                  Assign
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
      {can('iam.user.manage') ? (
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2>API keys (service accounts)</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Machine access with an explicit permission allowlist. Callers send the key in the{' '}
              <span className="mono">x-api-key</span> header.
            </p>
            {keyOnce ? (
              <div className="alert alert-ok">
                Key (shown once — store it now): <span className="mono">{keyOnce}</span>
              </div>
            ) : null}
            {apiKeys.length === 0 ? <div className="empty">No API keys yet.</div> : null}
            {apiKeys.map((k) => (
              <div key={k.id} className="spread" style={{ padding: '6px 0' }}>
                <div>
                  <strong>{k.name}</strong>{' '}
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {k.prefix}…
                  </span>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {k.permissions.join(', ')}
                    {k.lastUsedAt
                      ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}`
                      : ' · never used'}
                  </div>
                </div>
                <span>
                  <span className={`badge ${k.active ? 'badge-ok' : 'badge-danger'}`}>
                    {k.active ? 'ACTIVE' : 'REVOKED'}
                  </span>{' '}
                  {k.active ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api('POST', `/api/v1/iam/api-keys/${k.id}/revoke`),
                          'API key revoked.',
                        )
                      }
                      type="button"
                    >
                      Revoke
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            <form
              className="row"
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const created = await api<{ key: string }>('POST', '/api/v1/iam/api-keys', {
                    name: keyName,
                    permissions: keyPermissions
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                  setKeyOnce(created.key);
                  setKeyName('');
                }, 'API key created.');
              }}
            >
              <input
                className="input"
                style={{ maxWidth: 150 }}
                placeholder="Key name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
              />
              <input
                className="input mono"
                placeholder="permissions, comma-separated"
                value={keyPermissions}
                onChange={(e) => setKeyPermissions(e.target.value)}
                required
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Create key
              </button>
            </form>
          </div>

          <div className="card">
            <h2>Security log</h2>
            {securityEvents.length === 0 ? (
              <div className="empty">No security events yet.</div>
            ) : (
              <table className="table">
                <tbody>
                  {securityEvents.slice(0, 20).map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {ev.eventType}
                        </span>
                        {ev.detail ? (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {ev.detail}
                          </div>
                        ) : null}
                      </td>
                      <td className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                        {new Date(ev.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => {
                void (async () => {
                  const download = async () => {
                    const data = await api<Record<string, unknown>>('GET', '/api/v1/tenant/export');
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'nexora-tenant-export.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    setNotice('Tenant data exported.');
                  };
                  try {
                    await download();
                  } catch (e: unknown) {
                    // Sensitive export demands a fresh password (step-up).
                    if (errorText(e).includes('fresh password')) {
                      const password = window.prompt(
                        'Confirm your password to export tenant data:',
                      );
                      if (!password) return;
                      try {
                        await api('POST', '/api/v1/auth/step-up', { currentPassword: password });
                        await download();
                      } catch (inner: unknown) {
                        setError(errorText(inner));
                      }
                    } else {
                      setError(errorText(e));
                    }
                  }
                })();
              }}
              type="button"
            >
              Export tenant data (JSON)
            </button>
          </div>
        </div>
      ) : null}

      {mfa?.hasPassword ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Two-factor authentication</h2>
          {mfa.mfaEnabled ? (
            <>
              <p>
                <span className="badge badge-ok">MFA enabled</span>{' '}
                <span className="muted">Sign-in requires your authenticator code.</span>
              </p>
              <div className="row">
                <input
                  className="input"
                  style={{ maxWidth: 180 }}
                  type="password"
                  placeholder="Current password"
                  value={mfaPassword}
                  onChange={(e) => setMfaPassword(e.target.value)}
                />
                <button
                  className="btn btn-sm"
                  disabled={busy || !mfaPassword}
                  onClick={() =>
                    void run(async () => {
                      await api('POST', '/api/v1/auth/mfa/disable', {
                        currentPassword: mfaPassword,
                      });
                      setMfaPassword('');
                      setMfa({ hasPassword: true, mfaEnabled: false });
                    }, 'MFA disabled.')
                  }
                >
                  Disable MFA
                </button>
              </div>
            </>
          ) : mfaSecret ? (
            <>
              <p className="muted">
                Add this secret to your authenticator app, then confirm with a code:
              </p>
              <p className="mono" style={{ wordBreak: 'break-all', fontSize: 13 }}>
                {mfaSecret.secret}
              </p>
              <p className="mono muted" style={{ wordBreak: 'break-all', fontSize: 11 }}>
                {mfaSecret.otpauthUri}
              </p>
              <div className="row">
                <input
                  className="input mono"
                  style={{ maxWidth: 120 }}
                  inputMode="numeric"
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || mfaCode.trim().length < 6}
                  onClick={() =>
                    void run(async () => {
                      await api('POST', '/api/v1/auth/mfa/confirm', { code: mfaCode.trim() });
                      setMfaSecret(null);
                      setMfaCode('');
                      setMfa({ hasPassword: true, mfaEnabled: true });
                    }, 'MFA enabled — sign-in now requires your code.')
                  }
                >
                  Confirm code
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Protect your password sign-in with a 6-digit code from an authenticator app.
              </p>
              <button
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const secret = await api<{ secret: string; otpauthUri: string }>(
                      'POST',
                      '/api/v1/auth/mfa/enroll',
                    );
                    setMfaSecret(secret);
                  }, 'Enrollment started — add the secret to your app.')
                }
              >
                Enable MFA
              </button>
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}
