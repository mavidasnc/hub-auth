/**
 * Modale con la pagina "about" dell'app (dalla 1.12.0).
 *
 * "Approfondisci" nel pannello di login apre la pagina `/about/` senza far uscire
 * l'utente dal login. La pagina resta un file statico a sé (raggiungibile e
 * indicizzabile all'indirizzo diretto): qui se ne scarica l'HTML, si prende il
 * solo `<main>` e lo si mostra nella modale.
 *
 * Perché non un iframe: le app inviano `frame-ancestors 'none'` e
 * `X-Frame-Options: DENY`, che vietano l'incorniciamento anche dalla stessa origine.
 * L'HTML scaricato è sanificato con DOMPurify (istanza propria, caricata solo alla
 * prima apertura), si tengono i soli tag di un testo editoriale e gli indirizzi
 * relativi (immagini, link) sono risolti rispetto alla pagina scaricata, perché
 * dalla pagina di login `/login-hero.jpg` o `about.png` non puntano allo stesso posto.
 *
 * Usa l'elemento <dialog> nativo come PrivacyDialog: focus trap, Esc e sfondo
 * oscurato sono del browser.
 */

import { useEffect, useRef, useState } from 'react';
import type { HubAuthMessages } from './messages.js';

export interface AboutDialogProps {
  /** Indirizzo della pagina about, sulla stessa origine (es. '/about/') */
  href: string;
  /** Titolo della modale (il testo del pulsante che l'ha aperta) */
  title: string;
  messages: HubAuthMessages;
  /** Chiusura (pulsante, Esc o clic sullo sfondo) */
  onClose: () => void;
  /** La pagina non si è potuta caricare: il chiamante porta l'utente all'indirizzo diretto */
  onFail: () => void;
}

// Tag e attributi di un testo editoriale con immagini e domande frequenti
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'a',
  'div', 'span', 'section', 'figure', 'figcaption', 'img', 'details', 'summary',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'width', 'height', 'title', 'target', 'rel', 'class'];

// Un solo caricamento per indirizzo e per pagina: riaprire la modale non riscarica nulla
const cache = new Map<string, Promise<string>>();

/** Scarica la pagina e restituisce l'HTML sanificato del suo `<main>` */
async function loadAbout(href: string): Promise<string> {
  const res = await fetch(href, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`about: HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const main = doc.querySelector('main');
  if (!main) throw new Error('about: la pagina non ha un <main>');
  // Il percorso di navigazione ("Fleet / Come funziona") rimanda al login: qui non serve
  main.querySelector('nav')?.remove();

  const { default: createDOMPurify } = await import('dompurify');
  // Istanza propria: gli hook non devono toccare il DOMPurify condiviso dall'app
  const purify = createDOMPurify(window);
  const base = new URL(href, window.location.href);
  purify.addHook('afterSanitizeAttributes', (node) => {
    // Gli indirizzi relativi della pagina about si leggono rispetto alla sua posizione
    for (const attribute of ['href', 'src']) {
      const value = node.getAttribute(attribute);
      if (!value) continue;
      try {
        node.setAttribute(attribute, new URL(value, base).href);
      } catch {
        node.removeAttribute(attribute);
      }
    }
    // I link escono dalla modale in una nuova scheda: il login resta com'è
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return purify.sanitize(main.innerHTML, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function AboutDialog({ href, title, messages, onClose, onFail }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  // L'ultimo onFail senza rilanciare il caricamento a ogni render
  const onFailRef = useRef(onFail);
  useEffect(() => { onFailRef.current = onFail; });

  // Apertura modale al montaggio (il ripiego sull'attributo open serve a jsdom, come in PrivacyDialog)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  // Caricamento della pagina; se fallisce (rete, 404, pagina senza <main>) si va all'indirizzo diretto
  useEffect(() => {
    // La richiesta è condivisa fra le aperture (e fra i due montaggi di StrictMode): non si
    // annulla alla chiusura, si ignora solo l'esito se la modale non c'è più
    let active = true;
    let request = cache.get(href);
    if (!request) {
      request = loadAbout(href);
      cache.set(href, request);
      // Un errore non si memorizza: la prossima apertura riprova
      request.catch(() => cache.delete(href));
    }
    request
      .then((content) => { if (active) setHtml(content); })
      .catch(() => { if (active) onFailRef.current(); });
    return () => { active = false; };
  }, [href]);

  return (
    <dialog
      ref={dialogRef}
      className="hub-auth__dialog hub-auth__dialog--wide"
      aria-labelledby="hub-auth-about-title"
      // Esc: il browser chiude il dialog e lancia "close", qui riportato al chiamante
      onClose={onClose}
      // Il dialog riempie lo sfondo oscurato: un clic su di esso (non sul contenuto) chiude
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="hub-auth__dialog-box">
        <h3 id="hub-auth-about-title" className="hub-auth__dialog-title">{title}</h3>

        {/* tabIndex: la zona scorrevole si legge anche da tastiera */}
        <div className="hub-auth__dialog-body" tabIndex={0} aria-busy={html === null}>
          {html === null
            ? <p>{messages.aboutLoading}</p>
            // L'HTML è già sanificato da DOMPurify
            : <div className="hub-auth__about" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>

        <div className="hub-auth__dialog-actions">
          <button className="hub-auth__button hub-auth__button--secondary" type="button" onClick={onClose}>
            {messages.aboutClose}
          </button>
        </div>
      </div>
    </dialog>
  );
}
