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

/** Feather-style 24x24 stroke icon paths (inline, no icon library). */
const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  parties:
    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  catalog:
    'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  inventory: 'M20 7h-9M14 17H5M17 4a3 3 0 100 6 3 3 0 000-6M7 14a3 3 0 100 6 3 3 0 000-6',
  operations:
    'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5',
  devices: 'M5 2h9a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2zM12 18h.01M7 2v3h5V2',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6',
  platform: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name] ?? ''} />
    </svg>
  );
}

const NAV: Array<{ href: string; label: string; icon: string; permission: string | null }> = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', permission: null },
  { href: '/tasks', label: 'Tasks', icon: 'tasks', permission: null },
  { href: '/parties', label: 'Parties', icon: 'parties', permission: 'mdm.read' },
  { href: '/catalog', label: 'Catalog', icon: 'catalog', permission: 'product.read' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory', permission: 'inventory.read' },
  { href: '/operations', label: 'Operations', icon: 'operations', permission: 'inventory.read' },
  { href: '/devices', label: 'Devices', icon: 'devices', permission: 'device.read' },
  { href: '/users', label: 'Users & roles', icon: 'users', permission: 'iam.user.manage' },
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
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          ))}
          {session.platformAdmin ? (
            <Link
              href="/platform"
              className={`nav-item ${pathname === '/platform' ? 'active' : ''}`}
            >
              <NavIcon name="platform" />
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
