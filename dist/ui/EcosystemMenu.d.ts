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
import { type HubAuthMessages } from './messages.js';
export interface EcosystemNavProps {
    /** Chiave dell'app corrente (esclusa dall'elenco); se manca si usa l'host della pagina */
    current?: string;
    /** Testi da sovrascrivere */
    messages?: Partial<HubAuthMessages>;
    /** Classe aggiuntiva sul <nav> */
    className?: string;
}
export declare function EcosystemNav({ current, messages: custom, className }: EcosystemNavProps): import("react").JSX.Element | null;
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
export declare function EcosystemMenu({ current, theme, align, label, messages: custom, className, }: EcosystemMenuProps): import("react").JSX.Element | null;
