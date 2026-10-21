/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, per intero, in una
 * modale (dalla 1.5.0) aperta dal link nella frase del consenso o dal pulsante
 * sotto la casella, suddiviso in paragrafi dalle righe vuote. La versione del
 * testo mostrato viaggia con la richiesta di registrazione (la gestisce il client).
 *
 * Dalla 1.12.0 un campo coupon facoltativo, chiuso dietro "Hai un coupon?" e già
 * aperto e precompilato se la pagina è stata aperta con `?coupon=CODICE`.
 */
import { type HubAuthMessages } from './messages.js';
export interface RegisterStepProps {
    messages?: Partial<HubAuthMessages>;
}
export declare function RegisterStep({ messages: custom }: RegisterStepProps): import("react").JSX.Element;
