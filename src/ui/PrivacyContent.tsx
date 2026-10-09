/**
 * Corpo dell'informativa privacy (dalla 1.7.0).
 *
 * Hub invia il testo con `format`:
 *  - 'markdown': viene convertito in HTML con marked e sanificato con DOMPurify
 *    (il testo lo scrive un admin, ma l'HTML non è mai considerato fidato).
 *    Dalla 1.8.0 la sanificazione ammette solo il sottoinsieme che produce il
 *    Markdown (titoli, elenchi, tabelle, enfasi, link, citazioni, codice): niente
 *    `style`, `form`, `input`, `img` o `iframe`, nemmeno scritti come HTML grezzo;
 *  - assente o 'text' (hub più vecchi): testo semplice a paragrafi, dove un
 *    paragrafo "Titolo\ntesto" mostra il titolo su una riga propria in grassetto.
 *
 * marked e DOMPurify si caricano solo alla prima apertura dell'informativa
 * (import dinamico), così non pesano sul bundle del login.
 */

import { useEffect, useState } from 'react';

export interface PrivacyContentProps {
  /** Testo dell'informativa, così come arriva da hub */
  text: string;
  /** Formato del testo: 'markdown' oppure testo semplice (default) */
  format?: 'markdown' | 'text';
}

type Renderer = (markdown: string) => string;

// Sottoinsieme di HTML ammesso: quello che il Markdown può produrre
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li',
  'strong', 'em', 'del', 'a', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

// Un solo caricamento per pagina: le aperture successive riusano il convertitore
let rendererPromise: Promise<Renderer> | null = null;

/** Carica marked e DOMPurify e restituisce la funzione Markdown → HTML sanificato */
function loadRenderer(): Promise<Renderer> {
  if (!rendererPromise) {
    rendererPromise = Promise.all([import('marked'), import('dompurify')]).then(
      ([{ marked }, { default: createDOMPurify }]) => {
        // Istanza propria: l'hook sui link non deve toccare il DOMPurify condiviso dall'app
        const purify = createDOMPurify(window);
        // I link dell'informativa si aprono in una nuova scheda, senza lasciare il form
        purify.addHook('afterSanitizeAttributes', (node) => {
          if (node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
          }
        });
        return (markdown: string) =>
          purify.sanitize(marked.parse(markdown, { gfm: true, async: false }) as string, {
            ALLOWED_TAGS,
            ALLOWED_ATTR,
          });
      },
    );
    // Se il caricamento fallisce (rete, chunk mancante) la prossima apertura riprova
    rendererPromise.catch(() => { rendererPromise = null; });
  }
  return rendererPromise;
}

/** Testo semplice: paragrafi separati da una riga vuota, "Titolo\ntesto" con titolo in grassetto */
function PlainText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((paragraph, index) => {
        const [first, ...rest] = paragraph.split('\n');
        return rest.length > 0 ? (
          <p key={index} className="hub-auth__privacy-text">
            <strong className="hub-auth__privacy-heading">{first.trim()}</strong>
            {rest.join(' ').trim()}
          </p>
        ) : (
          <p key={index} className="hub-auth__privacy-text">{paragraph}</p>
        );
      })}
    </>
  );
}

export function PrivacyContent({ text, format }: PrivacyContentProps) {
  const markdown = format === 'markdown';
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Conversione Markdown → HTML al cambio del testo; il flag evita di scrivere
  // lo stato dopo lo smontaggio (modale chiusa mentre il modulo si carica)
  useEffect(() => {
    if (!markdown) return;
    let active = true;
    setFailed(false);
    loadRenderer()
      .then((render) => { if (active) setHtml(render(text)); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [markdown, text]);

  if (!markdown || failed) return <PlainText text={text} />;
  if (html === null) return null;
  // L'HTML è già sanificato da DOMPurify
  return <div className="hub-auth__privacy-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
