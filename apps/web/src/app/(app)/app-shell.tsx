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
  sales: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  quotes:
    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  orders: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0',
  procurement:
    'M6 6h15l-1.5 9h-12zM6 6L5 2H2M8 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  engineering:
    'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  planning:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 16l2 2 4-4',
  production:
    'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 6v2M12 16v2M6 12h2M16 12h2M8.5 8.5l1.4 1.4M14.1 14.1l1.4 1.4M8.5 15.5l1.4-1.4M14.1 9.9l1.4-1.4',
  quality: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
};

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Global search (CORE-011): sidebar box routing typed hits to modules. */
function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      api<{ hits: SearchHit[] }>('GET', `/api/v1/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.hits))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: 'relative', padding: '0 10px 8px' }}>
      <input
        className="input"
        style={{ width: '100%', fontSize: 13 }}
        placeholder="Search everything…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Global search"
      />
      {hits !== null ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 10,
            right: 10,
            background: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {hits.length === 0 ? (
            <div className="muted" style={{ padding: 10, fontSize: 13 }}>
              No matches.
            </div>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.type}:${h.id}`}
                type="button"
                onClick={() => {
                  setQ('');
                  setHits(null);
                  router.push(h.href);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <div style={{ fontSize: 13 }}>{h.title}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {h.type.replace('_', ' ')} · {h.subtitle}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  { href: '/crm', label: 'Sales', icon: 'sales', permission: 'crm.read' },
  { href: '/quotes', label: 'Quotes', icon: 'quotes', permission: 'quote.read' },
  { href: '/orders', label: 'Orders', icon: 'orders', permission: 'order.read' },
  { href: '/procurement', label: 'Procurement', icon: 'procurement', permission: 'purchase.read' },
  { href: '/engineering', label: 'Engineering', icon: 'engineering', permission: 'bom.read' },
  { href: '/planning', label: 'Planning', icon: 'planning', permission: 'plan.read' },
  { href: '/production', label: 'Production', icon: 'production', permission: 'production.read' },
  { href: '/quality', label: 'Quality', icon: 'quality', permission: 'qc.read' },
  { href: '/finance', label: 'Finance', icon: 'finance', permission: 'finance.read' },
  { href: '/analytics', label: 'Analytics', icon: 'analytics', permission: 'analytics.read' },
  { href: '/portal', label: 'Portal', icon: 'portal', permission: 'portal.manage' },
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

  // UX rule: never render unauthorized modules. The portal entry is
  // visible to back-office managers and to portal customers alike.
  const nav = NAV.filter(
    (item) =>
      item.permission === null ||
      can(item.permission) ||
      (item.href === '/portal' && can('portal.access')),
  );

  function signOut() {
    clearSession();
    router.replace('/login');
  }

  return (
    <AppContext.Provider value={{ session, grants, can }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-brand">NexoraOS</div>
          {can('search.read') ? <GlobalSearch /> : null}
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
