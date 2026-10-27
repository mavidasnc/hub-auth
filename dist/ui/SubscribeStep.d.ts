/**
 * Step di pagamento del login (dalla 1.14.0): compare quando l'accesso è valido ma manca
 * un abbonamento (403 SubscriptionRequired di hub con i pagamenti accesi). Carica il listino,
 * fa scegliere piano e app, raccoglie i dati di fatturazione e porta l'utente a PayPal; al
 * ritorno il client apre la sessione da solo.
 *
 * Il form vero e proprio è `SubscribePicker` (dalla 1.17.0 una landing con tipo di cliente, dati
 * fiscali, indirizzo con suggerimenti e consensi), che non dipende dal client e si può montare
 * anche altrove (anteprima dell'admin).
 */
import { type HubAuthMessages } from './messages.js';
export interface SubscribeStepProps {
    messages?: Partial<HubAuthMessages>;
}
export declare function SubscribeStep({ messages: custom }: SubscribeStepProps): import("react").JSX.Element;
