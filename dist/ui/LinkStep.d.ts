/**
 * Conferma dell'accesso con il magic link dell'email OTP.
 *
 * Il link NON accede da solo: l'utente deve premere il pulsante. Così uno
 * scanner antiphishing del client email, che apre il link ed esegue il
 * JavaScript senza cliccare nulla, non consuma il token monouso.
 */
import { type HubAuthMessages } from './messages.js';
export interface LinkStepProps {
    messages?: Partial<HubAuthMessages>;
}
export declare function LinkStep({ messages: custom }: LinkStepProps): import("react").JSX.Element;
