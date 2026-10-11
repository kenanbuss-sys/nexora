'use client';

import { useState } from 'react';
import { api } from '../../../lib/api';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  type Column,
} from '../../../components/ui';
import { Fact, devErrorText, type Level, type TemplateView } from './shared';

/**
 * HCM-017 (Sprint 237) — training-plan templates (hcm.development.manage).
 * Publishing creates a NEW version on the server; plans already started
 * keep the version they were created from. Pure form + server answers.
 */

interface ItemDraft {
  key: string;
  text: string;
}

const KEY_RE = /^[a-z][a-z0-9-]{1,63}$/;

export function TrainingTemplates({
  templates,
  levels,
  error,
  onPublished,
}: {
  templates: TemplateView[] | null;
  levels: Level[];
  error: string | null;
  onPublished: (text: string) => void;
}) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([{ key: '', text: '' }]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const levelLabel = (k: string | null) =>
    k ? (levels.find((l) => l.key === k)?.label ?? k) : '—';

  const cleanItems = items
    .map((i) => ({ key: i.key.trim(), text: i.text.trim() }))
    .filter((i) => i.key || i.text);
  const itemKeys = cleanItems.map((i) => i.key);
  const hint = !KEY_RE.test(key.trim())
    ? 'Ključ: mala slova, brojevi i crtica (npr. zastita-na-radu)'
    : !name.trim()
      ? 'Unesite naziv šablona'
      : cleanItems.length === 0
        ? 'Dodajte bar jednu stavku'
        : cleanItems.some((i) => !i.key || !i.text)
          ? 'Svaka stavka treba ključ i tekst'
          : new Set(itemKeys).size !== itemKeys.length
            ? 'Ključevi stavki moraju biti jedinstveni'
            : null;

  const existing = templates?.find((t) => t.key === key.trim());

  function loadForEdit(t: TemplateView) {
    setKey(t.key);
    setName(t.name);
    setLevel(t.qualificationLevel ?? '');
    setItems(t.items.length ? t.items.map((i) => ({ ...i })) : [{ key: '', text: '' }]);
    setFormError(null);
  }

  async function publish() {
    setBusy(true);
    setFormError(null);
    try {
      const r = await api<TemplateView>('POST', '/api/v1/hcm/development/templates', {
        key: key.trim(),
        name: name.trim(),
        ...(level ? { qualificationLevel: level } : {}),
        items: cleanItems,
      });
      setConfirm(false);
      onPublished(`Šablon ${r.key} objavljen kao verzija ${r.version}.`);
    } catch (e: unknown) {
      setConfirm(false);
      setFormError(devErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<TemplateView>> = [
    {
      key: 'key',
      header: 'Ključ',
      render: (t) => <span className="mono">{t.key}</span>,
      text: (t) => t.key,
    },
    { key: 'name', header: 'Naziv', render: (t) => t.name, text: (t) => t.name },
    {
      key: 'level',
      header: 'Nivo kvalifikacije',
      render: (t) => levelLabel(t.qualificationLevel),
      text: (t) => levelLabel(t.qualificationLevel),
    },
    {
      key: 'items',
      header: 'Stavki',
      align: 'right',
      render: (t) => <span className="mono">{t.items.length}</span>,
    },
    {
      key: 'version',
      header: 'Verzija',
      align: 'right',
      render: (t) => <span className="mono">v{t.version}</span>,
    },
  ];

  return (
    <div className="card">
      <h2>Šabloni planova obuke</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Objava pod postojećim ključem pravi novu verziju; postojeći planovi zadržavaju svoju
        verziju. Klik na šablon učitava ga u formu.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {templates === null && !error ? (
        <EmptyState text="Učitavanje šablona…" />
      ) : templates !== null ? (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <DataTable
            columns={columns}
            rows={templates}
            rowKey={(t) => t.key}
            onRowClick={loadForEdit}
            searchPlaceholder="Pretraga šablona…"
            emptyText="Još nema šablona planova obuke."
          />
        </div>
      ) : null}

      <h2 style={{ marginTop: 16 }}>
        {existing ? `Nova verzija: ${existing.key}` : 'Novi šablon'}
      </h2>
      {formError ? <ErrorState text={formError} /> : null}
      <div className="grid-2">
        <div>
          <label className="label" htmlFor="tpl-key">
            Ključ
          </label>
          <input
            id="tpl-key"
            className="input mono"
            placeholder="zastita-na-radu"
            maxLength={64}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <label className="label" htmlFor="tpl-name">
            Naziv
          </label>
          <input
            id="tpl-name"
            className="input"
            placeholder="Uvođenje u rad — proizvodnja"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tpl-level">
            Nivo kvalifikacije (opcionalno)
          </label>
          <select
            id="tpl-level"
            className="select"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">— bez nivoa —</option>
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Šablon s nivoom je zadani za zaposlene tog nivoa pri pokretanju plana.
          </p>
        </div>
      </div>

      <label className="label" style={{ marginTop: 10 }}>
        Stavke
      </label>
      {items.map((it, idx) => (
        <div key={idx} className="row" style={{ flexWrap: 'wrap', marginBottom: 6 }}>
          <input
            className="input mono"
            style={{ maxWidth: 160 }}
            aria-label={`Ključ stavke ${idx + 1}`}
            placeholder={idx === 0 ? 'znr' : `stavka-${idx + 1}`}
            maxLength={40}
            value={it.key}
            onChange={(e) =>
              setItems(items.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
            }
          />
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            aria-label={`Tekst stavke ${idx + 1}`}
            placeholder={
              [
                'Zaštita na radu',
                'Rad na mašini pod nadzorom',
                'Rad na kasi',
                'Poznavanje asortimana',
              ][idx % 4]
            }
            maxLength={300}
            value={it.text}
            onChange={(e) =>
              setItems(items.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))
            }
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={items.length === 1}
            aria-label={`Ukloni stavku ${idx + 1}`}
            onClick={() => setItems(items.filter((_, i) => i !== idx))}
          >
            Ukloni
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={items.length >= 100}
          onClick={() => setItems([...items, { key: '', text: '' }])}
        >
          Dodaj stavku
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || hint !== null}
          title={hint ?? undefined}
          onClick={() => setConfirm(true)}
        >
          Pregledaj i objavi
        </button>
        {hint ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {hint}
          </span>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Objava šablona plana obuke"
        consequence={
          existing
            ? `Nastaje verzija ${existing.version + 1} (nova verzija; postojeći planovi zadržavaju svoju verziju).`
            : 'Nastaje verzija 1 novog šablona; kasnije izmjene prave nove verzije.'
        }
        confirmLabel="Objavi"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void publish()}
      >
        <Fact label="Ključ">
          <span className="mono">{key.trim()}</span>
        </Fact>
        <Fact label="Naziv">{name.trim()}</Fact>
        <Fact label="Nivo">{levelLabel(level || null)}</Fact>
        <Fact label="Stavki">
          <span className="mono">{cleanItems.length}</span>
        </Fact>
      </ConfirmDialog>
    </div>
  );
}
