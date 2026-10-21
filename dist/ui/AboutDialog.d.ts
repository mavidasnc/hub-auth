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
export declare function AboutDialog({ href, title, messages, onClose, onFail }: AboutDialogProps): import("react").JSX.Element;
