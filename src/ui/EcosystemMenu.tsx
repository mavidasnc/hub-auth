/**
 * Collegamenti alle altre app dell'ecosistema Mavida (dalla 1.8.0).
 *
 * - `EcosystemNav`: elenco di link in un `<nav>`, per il footer del login e per le
 *   pagine pubbliche. Sono link normali (visibili anche ai crawler).
 * - `EcosystemMenu`: pulsante con tendina da mettere nell'header o nella sidebar
 *   di un'app dopo il login. Si chiude con Esc o con un clic fuori.
 *
 * Il tema della tendina si cambia con le variabili `--hub-auth-eco-*` o con
 * `theme="dark"`; funziona anche fuori da `.hub-auth` (basta importare ui.css).
 */

import { useEffect, useId, useRef, useState } from 'react';
import { otherApps } from './ecosystem.js';
import { mergeMessages, type HubAuthMessages } from './messages.js';

export interface EcosystemNavProps {
  /** Chiave dell'app corrente (esclusa dall'elenco); se manca si usa l'host della pagina */
  current?: string;
  /** Testi da sovrascrivere */
  messages?: Partial<HubAuthMessages>;
  /** Classe aggiuntiva sul <nav> */
  className?: string;
}

export function EcosystemNav({ current, messages: custom, className = '' }: EcosystemNavProps) {
  const messages = mergeMessages(custom);
  const apps = otherApps(current);
  if (apps.length === 0) return null;
  return (
    <nav className={`hub-auth__ecosystem ${className}`.trim()} aria-label={messages.ecosystemTitle}>
      <p className="hub-auth__ecosystem-title">{messages.ecosystemTitle}</p>
      <ul className="hub-auth__ecosystem-list">
        {apps.map((app) => (
          <li key={app.key}>
            <a href={app.url} title={app.tagline} className="hub-auth__ecosystem-link">
              <span className="hub-auth__ecosystem-dot" style={{ background: app.color }} aria-hidden="true" />
              {app.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface EcosystemMenuProps {
  /** Chiave dell'app corrente (esclusa dall'elenco); se manca si usa l'host della pagina */
  current?: string;
  /** 'dark' per le app a tema scuro (default 'light') */
  theme?: 'light' | 'dark';
  /** Da quale lato si apre la tendina rispetto al pulsante (default 'start') */
  align?: 'start' | 'end';
  /** Testo del pulsante (default: messages.ecosystemMenu) */
  label?: string;
  /** Testi da sovrascrivere */
  messages?: Partial<HubAuthMessages>;
  /** Classe aggiuntiva sul contenitore */
  className?: string;
}

export function EcosystemMenu({
  current, theme = 'light', align = 'start', label, messages: custom, className = '',
}: EcosystemMenuProps) {
  const messages = mergeMessages(custom);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const apps = otherApps(current);

  // Chiusura con Esc o con un clic fuori, solo mentre la tendina è aperta
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (apps.length === 0) return null;
  return (
    <div
      ref={rootRef}
      className={`hub-auth-eco hub-auth-eco--${theme} hub-auth-eco--${align} ${className}`.trim()}
    >
      <button
        type="button"
        className="hub-auth-eco__button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {label ?? messages.ecosystemMenu}
        <span className="hub-auth-eco__chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul id={listId} className="hub-auth-eco__list">
          {apps.map((app) => (
            <li key={app.key}>
              <a href={app.url} className="hub-auth-eco__link" onClick={() => setOpen(false)}>
                <span className="hub-auth-eco__dot" style={{ background: app.color }} aria-hidden="true" />
                <span className="hub-auth-eco__text">
                  <span className="hub-auth-eco__name">{app.name}</span>
                  <span className="hub-auth-eco__tagline">{app.tagline}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
