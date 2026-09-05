'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { useApp } from './app-shell';

interface CommentView {
  id: string;
  body: string;
  mentions: string[];
  createdBy: string | null;
  createdAt: string;
}

interface AttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Reusable comments + attachments panel for any business record.
 * Business rules stay server-side; this only reads and posts.
 */
export function CollabPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { can } = useApp();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const query = `entityType=${entityType}&entityId=${entityId}`;
    api<{ comments: CommentView[] }>('GET', `/api/v1/comments?${query}`)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));
    api<{ attachments: AttachmentView[] }>('GET', `/api/v1/attachments?${query}`)
      .then((r) => setAttachments(r.attachments))
      .catch(() => setAttachments([]));
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!can('collab.use')) return null;

  async function post() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/comments', { entityType, entityId, body });
      setBody('');
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      await api('POST', '/api/v1/attachments', {
        entityType,
        entityId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        dataBase64: btoa(binary),
      });
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    try {
      const r = await api<AttachmentView & { dataBase64: string }>(
        'GET',
        `/api/v1/attachments/${id}/download`,
      );
      const bytes = Uint8Array.from(atob(r.dataBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  }

  return (
    <div
      style={{
        marginTop: 8,
        borderTop: '1px solid var(--color-border)',
        paddingTop: 8,
      }}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        Comments ({comments.length}) · Attachments ({attachments.length})
      </div>
      {comments.map((c) => (
        <div key={c.id} style={{ fontSize: 13, padding: '3px 0' }}>
          <span className="mono muted" style={{ fontSize: 11 }}>
            {new Date(c.createdAt).toLocaleString()}
          </span>{' '}
          {c.body}
        </div>
      ))}
      {attachments.map((a) => (
        <div key={a.id} style={{ fontSize: 13, padding: '3px 0' }}>
          📎{' '}
          <button
            className="btn btn-sm"
            style={{ padding: '1px 8px' }}
            onClick={() => void download(a.id)}
            type="button"
          >
            {a.fileName}
          </button>{' '}
          <span className="muted" style={{ fontSize: 11 }}>
            {(a.sizeBytes / 1024).toFixed(1)} KB
          </span>
        </div>
      ))}
      <form
        className="row"
        style={{ marginTop: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) void post();
        }}
      >
        <input
          className="input"
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !body.trim()} type="submit">
          Comment
        </button>
        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
          Attach
          <input
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </form>
    </div>
  );
}
