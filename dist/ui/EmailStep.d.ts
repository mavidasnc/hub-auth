/**
 * Primo passo del login: richiesta del codice OTP via email.
 *
 * otp-request risponde 200 anche per email sconosciute (anti-enumerazione):
 * qui non si può distinguere "email non registrata" da "email valida", per design.
 */
import { type HubAuthMessages } from './messages.js';
export interface EmailStepProps {
    messages?: Partial<HubAuthMessages>;
    /** Mostra il link "Registrati" quando hub offre la registrazione (default true) */
    signup?: boolean;
}
export declare function EmailStep({ messages: custom, signup }: EmailStepProps): import("react").JSX.Element;
