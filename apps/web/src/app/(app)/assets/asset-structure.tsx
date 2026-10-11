'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { eamErrorText, Fact, isoDay } from './equipment-common';

/**
 * Struktura sredstva (Sprint 243, EAM-002): put do korijena (linija →
 * mašina → sklop → dio), ugrađene komponente i istorija strukture.
 * Ugradnja/premještanje/demontaža idu preko servera (asset.manage), koji
 * provjerava cikluse, dubinu (najviše 6 nivoa) i rashodovana sredstva;
 * UI samo prikazuje odgovor servera.
 */

export type AssetStatus = 'IN_SERVICE' | 'UNDER_MAINTENANCE' | 'RETIRED';

export const STATUS_META: Record<AssetStatus, [string, string]> = {
  IN_SERVICE: ['U upotrebi', 'badge-ok'],
  UNDER_MAINTENANCE: ['Na održavanju', 'badge-warn'],
  RETIRED: ['Rashodovano', 'badge-danger'],
};

/** Minimal asset shape the structure screens need from the registry list. */
export interface StructureAsset {
  id: string;
  assetNumber: string;
  name: string;
  status: AssetStatus;
  parentAssetId: string | null;
}

interface TreeNode {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  status: AssetStatus;
  parentAssetId: string | null;
  depth: number;
}

interface AssetTree {
  ancestors: TreeNode[];
  asset: TreeNode;
  descendants: TreeNode[];
}

interface StructureChange {
  id: string;
  assetId: string;
  fromParentId: string | null;
  toParentId: string | null;
  reason: string;
  changedBy: string | null;
  effectiveAt: string;
}

type Mode = 'install' | 'move' | 'remove';

const MODE_META: Record<Mode, { title: string; consequence: string; label: string }> = {
  install: {
    title: 'Ugradnja u nadređeno sredstvo',
    consequence:
      'Sredstvo (s cijelim podstablom) postaje komponenta odabranog sredstva; promjena se upisuje u istoriju strukture i auditira.',
    label: 'Ugradi',
  },
  move: {
    title: 'Premještanje sredstva',
    consequence:
      'Sredstvo (s cijelim podstablom) prelazi u drugo nadređeno sredstvo; promjena se upisuje u istoriju strukture i auditira.',
    label: 'Premjesti',
  },
  remove: {
    title: 'Demontaža sredstva',
    consequence:
      'Sredstvo se odvaja od nadređenog i postaje samostalno; ugrađene komponente ostaju u njemu. Promjena se auditira.',
    label: 'Demontiraj',
  },
};

const CHANGE_KIND = (c: StructureChange): [string, string] =>
  c.fromParentId === null
    ? ['Ugradnja', 'badge-ok']
    : c.toParentId === null
      ? ['Demontaža', 'badge-warn']
      : ['Premještanje', 'badge-info'];

const linkStyle = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'var(--color-accent)',
  cursor: 'pointer',
  font: 'inherit',
  textDecoration: 'underline',
} as const;

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** Button that opens another asset's detail (the page has no per-asset URL). */
export function AssetLink({
  id,
  label,
  onOpen,
}: {
  id: string;
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button type="button" className="mono" style={linkStyle} onClick={() => onOpen(id)}>
      {label}
    </button>
  );
}

/**
 * Display order for the registry's "Prikaži strukturu" view: pre-order
 * walk over parentAssetId among the given rows. A row whose parent is not
 * among them (filtered out) is shown as a root. Presentation only.
 */
export function structureOrder<T extends StructureAsset>(
  rows: T[],
): Array<{ row: T; depth: number }> {
  const byNumber = (a: T, b: T) => a.assetNumber.localeCompare(b.assetNumber);
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of rows) {
    if (r.parentAssetId && ids.has(r.parentAssetId)) {
      const list = children.get(r.parentAssetId) ?? [];
      list.push(r);
      children.set(r.parentAssetId, list);
    } else {
      roots.push(r);
    }
  }
  const out: Array<{ row: T; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (r: T, depth: number) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push({ row: r, depth });
    for (const c of (children.get(r.id) ?? []).sort(byNumber)) walk(c, depth + 1);
  };
  for (const r of roots.sort(byNumber)) walk(r, 0);
  // Defensive: anything unreachable (inconsistent data) still gets listed.
  for (const r of rows) if (!seen.has(r.id)) walk(r, 0);
  return out;
}

export function AssetStructure({
  asset,
  assets,
  canManage,
  onOpenAsset,
  onChanged,
}: {
  asset: StructureAsset;
  /** Registry list — parent picker options and asset numbers for history. */
  assets: StructureAsset[];
  canManage: boolean;
  onOpenAsset: (id: string) => void;
  onChanged: () => void;
}) {
  const [tree, setTree] = useState<AssetTree | null>(null);
  const [history, setHistory] = useState<StructureChange[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [parentId, setParentId] = useState('');
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

  const assetId = asset.id;
  const load = useCallback(() => {
    Promise.all([
      api<AssetTree>('GET', `/api/v1/assets/${assetId}/tree`),
      api<{ changes: StructureChange[] }>('GET', `/api/v1/assets/${assetId}/structure-history`),
    ])
      .then(([t, h]) => {
        setTree(t);
        setHistory(h.changes);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(eamErrorText(e)));
  }, [assetId]);
  // Reload whenever the registry list was refreshed (status/parent changes).
  useEffect(load, [load, assets]);

  const numberOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) m.set(a.id, a.assetNumber);
    if (tree)
      for (const n of [...tree.ancestors, tree.asset, ...tree.descendants]) {
        m.set(n.id, n.assetNumber);
      }
    return m;
  }, [assets, tree]);

  // Picker convenience only — the server still rejects cycles, depth and
  // retired parents.
  const parentOptions = useMemo(() => {
    const excluded = new Set<string>([asset.id]);
    if (asset.parentAssetId) excluded.add(asset.parentAssetId);
    for (const d of tree?.descendants ?? []) excluded.add(d.id);
    return assets
      .filter((a) => !excluded.has(a.id) && a.status !== 'RETIRED')
      .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
  }, [assets, asset.id, asset.parentAssetId, tree]);

  const retired = asset.status === 'RETIRED';
  const blockedTitle = retired
    ? 'Rashodovano sredstvo se ne može ugraditi ni premjestiti'
    : undefined;

  function openDialog(m: Mode) {
    setMode(m);
    setParentId('');
    setReason('');
    setDialogError(null);
    setNotice(null);
  }

  async function submit() {
    if (!mode) return;
    const r = reason.trim();
    if (mode !== 'remove' && !parentId) {
      setDialogError('Odaberite nadređeno sredstvo.');
      return;
    }
    if (r.length < 3 || r.length > 300) {
      setDialogError('Razlog je obavezan (3–300 znakova).');
      return;
    }
    setBusy(true);
    setDialogError(null);
    try {
      await api('POST', `/api/v1/assets/${asset.id}/parent`, {
        parentAssetId: mode === 'remove' ? null : parentId,
        reason: r,
      });
      const target = numberOf.get(parentId) ?? '';
      setNotice(
        mode === 'remove'
          ? 'Sredstvo je demontirano.'
          : mode === 'install'
            ? `Sredstvo je ugrađeno u ${target}.`
            : `Sredstvo je premješteno u ${target}.`,
      );
      setMode(null);
      onChanged();
      load();
    } catch (e: unknown) {
      setDialogError(eamErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const otherNumber = (id: string | null) => (id ? (numberOf.get(id) ?? '—') : '—');

  return (
    <>
      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Struktura</h3>
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {loadError ? (
        <ErrorState text={loadError} />
      ) : !tree ? (
        <LoadingState text="Učitavanje strukture…" />
      ) : (
        <>
          <nav aria-label="Put u strukturi">
            <ol
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 8px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                fontSize: 13,
              }}
            >
              {tree.ancestors.map((n) => (
                <li key={n.id}>
                  <AssetLink id={n.id} label={n.assetNumber} onOpen={onOpenAsset} />{' '}
                  <span className="muted">{n.name}</span>{' '}
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                </li>
              ))}
              <li aria-current="page">
                <strong className="mono">{tree.asset.assetNumber}</strong> {tree.asset.name}
              </li>
            </ol>
          </nav>
          {tree.ancestors.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
              Samostalno sredstvo (nije ugrađeno u drugo).
            </p>
          ) : null}

          <div className="label" id="components-heading">
            Ugrađene komponente
          </div>
          {tree.descendants.length === 0 ? (
            <EmptyState text="U ovo sredstvo nije ugrađena nijedna komponenta." />
          ) : (
            <ul
              aria-labelledby="components-heading"
              style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}
            >
              {tree.descendants.map((n) => (
                <li
                  key={n.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '3px 0',
                    marginLeft: (n.depth - 1) * 18,
                  }}
                >
                  <span className="muted" aria-hidden="true">
                    └
                  </span>
                  <span style={visuallyHidden}>Nivo {n.depth}:</span>
                  <AssetLink id={n.id} label={n.assetNumber} onOpen={onOpenAsset} />
                  <span>{n.name}</span>
                  <span className="muted">{n.category}</span>
                  <span className={`badge ${STATUS_META[n.status][1]}`}>
                    {STATUS_META[n.status][0]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
              {asset.parentAssetId ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy || retired}
                    title={blockedTitle}
                    onClick={() => openDialog('move')}
                  >
                    Premjesti
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={busy || retired}
                    title={blockedTitle}
                    onClick={() => openDialog('remove')}
                  >
                    Demontiraj
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || retired}
                  title={blockedTitle}
                  onClick={() => openDialog('install')}
                >
                  Ugradi u…
                </button>
              )}
            </div>
          ) : null}
          {canManage && retired ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Rashodovano sredstvo se ne može ugraditi, premjestiti ni demontirati.
            </p>
          ) : null}
        </>
      )}

      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Istorija strukture</h3>
      {loadError ? null : history === null ? (
        <LoadingState text="Učitavanje istorije strukture…" />
      ) : history.length === 0 ? (
        <EmptyState text="Struktura ovog sredstva još nije mijenjana." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Promjena</th>
              <th>Komponenta</th>
              <th>Iz</th>
              <th>U</th>
              <th>Razlog</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((c) => {
              const [kind, badge] = CHANGE_KIND(c);
              return (
                <tr key={c.id}>
                  <td className="mono">{isoDay(c.effectiveAt)}</td>
                  <td>
                    <span className={`badge ${badge}`}>{kind}</span>
                  </td>
                  <td className="mono">
                    {c.assetId === asset.id ? asset.assetNumber : otherNumber(c.assetId)}
                  </td>
                  <td className="mono">{otherNumber(c.fromParentId)}</td>
                  <td className="mono">{otherNumber(c.toParentId)}</td>
                  <td>{c.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {mode ? (
        <ConfirmDialog
          open
          title={MODE_META[mode].title}
          consequence={MODE_META[mode].consequence}
          confirmLabel={MODE_META[mode].label}
          danger={mode === 'remove'}
          busy={busy}
          onConfirm={() => void submit()}
          onCancel={() => setMode(null)}
        >
          <Fact label="Sredstvo">
            {asset.assetNumber} — {asset.name}
          </Fact>
          {asset.parentAssetId ? (
            <Fact label="Trenutno ugrađeno u">{otherNumber(asset.parentAssetId)}</Fact>
          ) : null}
          {mode !== 'remove' ? (
            <>
              <label className="label" htmlFor="structure-parent">
                {mode === 'install' ? 'Ugradi u' : 'Premjesti u'}
              </label>
              {parentOptions.length === 0 ? (
                <EmptyState text="Nema sredstava u koja se ovo sredstvo može ugraditi." />
              ) : (
                <select
                  id="structure-parent"
                  className="select"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  required
                >
                  <option value="">— odaberite sredstvo —</option>
                  {parentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetNumber} — {a.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Struktura može imati najviše 6 nivoa; server odbija cikluse i rashodovana sredstva.
              </p>
            </>
          ) : null}
          <label className="label" htmlFor="structure-reason">
            Razlog (obavezno)
          </label>
          <input
            id="structure-reason"
            className="input"
            placeholder="npr. Zamjena ležaja na liniji 2"
            value={reason}
            maxLength={300}
            required
            aria-invalid={dialogError !== null}
            aria-describedby={dialogError ? 'structure-error' : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
          {dialogError ? (
            <div id="structure-error" style={{ marginTop: 8 }}>
              <ErrorState text={dialogError} />
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
