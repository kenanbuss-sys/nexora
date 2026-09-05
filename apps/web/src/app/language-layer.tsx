'use client';

import { useEffect, useState } from 'react';
import { getLanguage, setLanguage, translateText, type UiLanguage } from '../lib/i18n';

/**
 * Display-time language layer (CORE-005). When Bosnian is selected it
 * translates the interface chrome as it renders (text nodes,
 * placeholders, titles) via a dictionary, leaving business data alone.
 * Switching back to English reloads to restore the authored strings.
 */
export function LanguageLayer() {
  const [lang, setLang] = useState<UiLanguage>('en');

  useEffect(() => {
    const current = getLanguage();
    setLang(current);
    if (current !== 'bs') return;

    const translated = new WeakSet<Node>();
    const walk = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        const value = node.nodeValue;
        if (value && value.trim()) {
          const next = translateText(value);
          if (next !== value) node.nodeValue = next;
        }
        node = walker.nextNode();
      }
      if (root instanceof Element || root instanceof Document) {
        for (const el of root.querySelectorAll<HTMLElement>('[placeholder], [title]')) {
          if (translated.has(el)) continue;
          const placeholder = el.getAttribute('placeholder');
          if (placeholder) {
            const next = translateText(placeholder);
            if (next !== placeholder) el.setAttribute('placeholder', next);
          }
          const title = el.getAttribute('title');
          if (title) {
            const next = translateText(title);
            if (next !== title) el.setAttribute('title', next);
          }
        }
      }
    };

    walk(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeValue) {
          const next = translateText(mutation.target.nodeValue);
          if (next !== mutation.target.nodeValue) mutation.target.nodeValue = next;
        }
        for (const added of mutation.addedNodes) walk(added);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  function switchTo(next: UiLanguage) {
    if (next === lang) return;
    setLanguage(next);
    window.location.reload();
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 10,
        bottom: 10,
        zIndex: 60,
        display: 'flex',
        gap: 2,
        background: 'rgba(17,24,39,0.85)',
        borderRadius: 8,
        padding: 3,
      }}
      aria-label="Language"
    >
      {(['en', 'bs'] as UiLanguage[]).map((code) => (
        <button
          key={code}
          onClick={() => switchTo(code)}
          type="button"
          style={{
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            padding: '3px 9px',
            fontSize: 12,
            fontWeight: 700,
            background: lang === code ? '#2563eb' : 'transparent',
            color: lang === code ? '#fff' : '#9ca3af',
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
