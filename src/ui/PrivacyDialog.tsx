/**
 * Modale con il testo completo dell'informativa privacy (dalla 1.5.0).
 *
 * Usa l'elemento <dialog> nativo aperto con showModal(): focus trap, tasto Esc e
 * sfondo oscurato sono del browser. Il testo arriva da hub (GET /auth/tool-config)
 * ed è già suddiviso in paragrafi da RegisterStep; un paragrafo "Titolo\ntesto"
 * mostra il titolo su una riga propria, in grassetto.
 */

import { useEffect, useRef } from 'react';
import type { HubAuthMessages } from './messages.js';
import { PrivacyContent } from './PrivacyContent.js';

export interface PrivacyDialogProps {
  messages: HubAuthMessages;
  /** Testo dell'informativa, come arriva da hub */
  text: string;
  /** Formato del testo: 'markdown' oppure testo semplice (hub più vecchi) */
  format?: 'markdown' | 'text';
  /** Chiusura senza consenso (pulsante Chiudi, Esc o clic sullo sfondo) */
  onClose: () => void;
  /** Chiusura con il consenso: il form spunta la casella dell'informativa */
  onAccept: () => void;
}

export function PrivacyDialog({ messages, text, format, onClose, onAccept }: PrivacyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Apertura modale al montaggio. Il ripiego sull'attributo open serve agli
  // ambienti senza showModal (es. jsdom nei test dei progetti che usano la libreria)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="hub-auth__dialog"
      aria-labelledby="hub-auth-privacy-title"
      // Esc: il browser chiude il dialog e lancia "close", qui riportato al form
      onClose={onClose}
      // Il dialog riempie lo sfondo oscurato: un clic su di esso (non sul contenuto) chiude
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="hub-auth__dialog-box">
        <h3 id="hub-auth-privacy-title" className="hub-auth__dialog-title">{messages.privacyTitle}</h3>

        {/* tabIndex: la zona scorrevole si legge anche da tastiera */}
        <div className="hub-auth__dialog-body" tabIndex={0}>
          <PrivacyContent text={text} format={format} />
        </div>

        <div className="hub-auth__dialog-actions">
          <button className="hub-auth__button hub-auth__button--secondary" type="button" onClick={onClose}>
            {messages.privacyClose}
          </button>
          <button className="hub-auth__button" type="button" onClick={onAccept}>
            {messages.privacyAccept}
          </button>
        </div>
      </div>
    </dialog>
  );
}
