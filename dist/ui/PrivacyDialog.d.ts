/**
 * Modale con il testo completo dell'informativa privacy (dalla 1.5.0).
 *
 * Usa l'elemento <dialog> nativo aperto con showModal(): focus trap, tasto Esc e
 * sfondo oscurato sono del browser. Il testo arriva da hub (GET /auth/tool-config)
 * ed è già suddiviso in paragrafi da RegisterStep; un paragrafo "Titolo\ntesto"
 * mostra il titolo su una riga propria, in grassetto.
 */
import type { HubAuthMessages } from './messages.js';
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
export declare function PrivacyDialog({ messages, text, format, onClose, onAccept }: PrivacyDialogProps): import("react").JSX.Element;
