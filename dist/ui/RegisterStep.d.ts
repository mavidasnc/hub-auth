/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, in un box scorrevole,
 * suddiviso in paragrafi dalle righe vuote. La versione del testo mostrato
 * viaggia con la richiesta di registrazione (la gestisce il client).
 */
import { type HubAuthMessages } from './messages.js';
export interface RegisterStepProps {
    messages?: Partial<HubAuthMessages>;
}
export declare function RegisterStep({ messages: custom }: RegisterStepProps): import("react").JSX.Element;
