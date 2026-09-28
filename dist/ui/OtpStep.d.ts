/**
 * Secondo passo del login: inserimento del codice OTP.
 *
 * - invio con Enter, con il pulsante o automatico alla sesta cifra, senza
 *   doppi invii dello stesso codice
 * - reinvio del codice con cooldown e conto alla rovescia
 * - "cambia email" per tornare al primo passo
 */
import { type HubAuthMessages } from './messages.js';
export interface OtpStepProps {
    messages?: Partial<HubAuthMessages>;
    /** Secondi di attesa prima di poter reinviare il codice (default 60) */
    resendCooldown?: number;
}
export declare function OtpStep({ messages: custom, resendCooldown }: OtpStepProps): import("react").JSX.Element;
