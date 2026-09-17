'use client';

import { useMemo, useState, type ReactNode } from 'react';

/**
 * Shared UI building blocks (Sprint 215): a consistent data table with
 * search + pagination, and explicit loading/empty/error states. Pure
 * presentation — no business logic (UX rule), tokens only.
 */

export function LoadingState({ text = 'Učitavanje…' }: { text?: string }) {
  return <div className="loading">{text}</div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function ErrorState({ text }: { text: string }) {
  return (
    <div className="alert alert-error" role="alert">
      {text}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Plain-text accessor used by the search box; omit to skip. */
  text?: (row: T) => string;
  align?: 'right';
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: string;
  /** Extra controls rendered next to the search box (filters). */
  toolbar?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  searchPlaceholder = 'Pretraga…',
  pageSize = 10,
  emptyText = 'Nema podataka.',
  toolbar,
}: DataTableProps<T>) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const searchable = columns.some((c) => c.text);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((c) => c.text && c.text(row).toLowerCase().includes(needle)),
    );
  }, [rows, q, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <div>
      {(searchable || toolbar) && rows.length > 0 ? (
        <div className="row" style={{ marginBottom: 10 }}>
          {searchable ? (
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              aria-label={searchPlaceholder}
            />
          ) : null}
          {toolbar}
          {q ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {filtered.length} od {rows.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? <EmptyState text={emptyText} /> : null}
      {rows.length > 0 && filtered.length === 0 ? (
        <EmptyState text="Ništa ne odgovara pretrazi." />
      ) : null}

      {visible.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {pages > 1 ? (
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← Prethodna
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Strana {safePage + 1} / {pages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Sljedeća →
          </button>
        </div>
      ) : null}
    </div>
  );
}
