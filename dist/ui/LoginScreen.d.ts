/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (logo, descrizione, avvisi o altro) e a destra il
 * login, in un contenitore largo al massimo 1200px (`--hub-auth-split-max-width`);
 * sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 *
 * Dalla 1.8.0: `asideImage` (immagine nel pannello di default), `ecosystem` (blocco
 * "Le altre app Mavida" sotto la card) e landmark semantici (`<main>`, `<footer>`).
 */
import { type ReactNode } from 'react';
import { type HubAuthMessages } from './messages.js';
/** Immagine del pannello laterale (es. uno screenshot dell'app) */
export interface AsideImage {
    /** URL dell'immagine (es. '/login-hero.jpg') */
    src: string;
    /** Testo alternativo: descrive l'immagine per chi non la vede e per i motori di ricerca */
    alt: string;
    /** Dimensioni intrinseche in pixel: riservano lo spazio ed evitano lo spostamento del layout */
    width?: number;
    height?: number;
}
/** Pulsante sotto l'immagine del pannello (es. "Approfondisci" verso la pagina about) */
export interface AsideLink {
    /** Destinazione del link (es. '/about/') */
    href: string;
    /** Testo del pulsante (es. 'Approfondisci') */
    label: string;
}
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
    /**
     * Immagine nel pannello di default, sotto descrizione e avviso (dalla 1.8.0). Da sola
     * basta a far comparire il pannello; con un `aside` personalizzato è ignorata.
     */
    asideImage?: AsideImage;
    /**
     * Pulsante (CTA) nel pannello di default, sotto l'immagine (dalla 1.10.0): un link
     * normale, visibile e seguibile anche dai motori di ricerca. Da solo basta a far
     * comparire il pannello; con un `aside` personalizzato è ignorato.
     */
    asideLink?: AsideLink;
    /**
     * Mostra sotto la card il blocco "Le altre app Mavida", con i link alle altre app
     * dell'ecosistema (dalla 1.8.0, default false: admin e log non lo vogliono).
     */
    ecosystem?: boolean;
}
export declare function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className, aside, layout, signup, asideImage, asideLink, ecosystem, }: LoginScreenProps): import("react").JSX.Element;
