/**
 * Conferma di registrazione con account da approvare: l'utente è in stato
 * "pending" finché un amministratore non lo attiva; lo avvisa una email.
 */
import { type HubAuthMessages } from './messages.js';
export interface RegisteredStepProps {
    messages?: Partial<HubAuthMessages>;
}
export declare function RegisteredStep({ messages: custom }: RegisteredStepProps): import("react").JSX.Element;
