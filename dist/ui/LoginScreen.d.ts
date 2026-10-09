/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (descrizione, avvisi o altro) e a destra il
 * login; sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 */
import { type ReactNode } from 'react';
import { type HubAuthMessages } from './messages.js';
export interface LoginScreenProps {
    /** Titolo della card (es. nome dell'app) */
    title?: ReactNode;
    /** Sottotitolo sotto il titolo */
    subtitle?: ReactNode;
    /** Logo sopra il titolo */
    logo?: ReactNode;
    /** Contenuto sotto la card (es. link di registrazione) */
    footer?: ReactNode;
    /** Testi da sovrascrivere */
    messages?: Partial<HubAuthMessages>;
    /** Secondi di attesa prima del reinvio del codice (default 60) */
    resendCooldown?: number;
    /** Classe aggiuntiva sul contenitore (per temi e override) */
    className?: string;
    /**
     * Contenuto del pannello laterale: sostituisce quello di default (etichetta,
     * descrizione e avviso del tool letti da hub).
     */
    aside?: ReactNode;
    /**
     * 'auto' (default): due metà solo se c'è un pannello da mostrare; 'split' le
     * forza; 'centered' mantiene sempre la sola card centrata.
     */
    layout?: 'auto' | 'split' | 'centered';
    /** Mostra il link "Registrati" quando hub offre la registrazione (default true) */
    signup?: boolean;
}
export declare function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className, aside, layout, signup, }: LoginScreenProps): import("react").JSX.Element;
