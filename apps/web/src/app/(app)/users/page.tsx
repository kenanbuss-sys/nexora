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

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [idpSubject, setIdpSubject] = useState('');
  const [assignUser, setAssignUser] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

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
    </main>
  );
}
