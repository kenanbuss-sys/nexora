'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { clearSession, getSession, type Session } from '../../lib/session';

interface Grant {
  permissionKey: string;
  scopeType: string;
  scopeId: string | null;
}

interface AppContextValue {
  session: Session;
  grants: Grant[];
  can: (permissionKey: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app shell');
  return value;
}

const NAV: Array<{ href: string; label: string; permission: string | null }> = [
  { href: '/', label: 'Dashboard', permission: null },
  { href: '/tasks', label: 'Tasks', permission: null },
  { href: '/parties', label: 'Parties', permission: 'mdm.read' },
  { href: '/catalog', label: 'Catalog', permission: 'product.read' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.read' },
  { href: '/operations', label: 'Operations', permission: 'inventory.read' },
  { href: '/devices', label: 'Devices', permission: 'device.read' },
  { href: '/users', label: 'Users & roles', permission: 'iam.user.manage' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<Session | null>(null);
  const [grants, setGrants] = useState<Grant[] | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSessionState(s);
    api<{ grants: Grant[] }>('GET', '/api/v1/me/permissions')
      .then((r) => setGrants(r.grants))
      .catch(() => setGrants([]));
  }, [router]);

  if (!session || grants === null) {
    return <div className="loading page">Loading workspace…</div>;
  }

  const can = (permissionKey: string): boolean =>
    session.platformAdmin ||
    grants.some((g) => g.permissionKey === permissionKey && g.scopeType === 'TENANT');

  // UX rule: never render unauthorized modules.
  const nav = NAV.filter((item) => item.permission === null || can(item.permission));

  function signOut() {
    clearSession();
    router.replace('/login');
  }

  return (
    <AppContext.Provider value={{ session, grants, can }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-brand">Business OS</div>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
          {session.platformAdmin ? (
            <Link
              href="/platform"
              className={`nav-item ${pathname === '/platform' ? 'active' : ''}`}
            >
              Platform
            </Link>
          ) : null}
          <div className="sidebar-footer">
            <div style={{ color: '#fff' }}>{session.subject}</div>
            <div>tenant: {session.tenantSlug}</div>
            <button
              className="btn btn-sm"
              style={{ marginTop: 8, width: '100%' }}
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </AppContext.Provider>
  );
}
