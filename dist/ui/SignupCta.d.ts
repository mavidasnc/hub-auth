/**
 * CTA di registrazione sotto il form di accesso (dalla 1.13.0).
 *
 * Un pulsante in evidenza al posto del vecchio link di testo: se hub comunica i
 * giorni di prova (`toolConfig.trial_days`, hub >= 0.261.0) il testo li promette
 * ("Registrati e prova gratis per 14 giorni"), altrimenti resta `signupLink`.
 * Lo usano il passo dell'email e quello del codice, che mostrano la stessa strada.
 */
import { type HubAuthMessages } from './messages.js';
export interface SignupCtaProps {
    messages: HubAuthMessages;
}
export declare function SignupCta({ messages }: SignupCtaProps): import("react").JSX.Element;
