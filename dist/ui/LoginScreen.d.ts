/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato ed EmailStep / OtpStep in base allo step del client.
 */
import type { ReactNode } from 'react';
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
}
export declare function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className, }: LoginScreenProps): import("react").JSX.Element;
