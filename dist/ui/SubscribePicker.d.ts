/**
 * Pagina di pagamento: scelta dell'abbonamento, dati di fatturazione e ordine.
 *
 * Dalla 1.17.0 è una landing in stile Mavida (tema scuro, acquamarina) con tipo di cliente
 * (azienda o privato), controlli sui dati fiscali, suggerimento dell'indirizzo, consensi di
 * legge e pulsante «Ordina con obbligo di pagamento» sempre attivo (gli errori compaiono al
 * clic). Il prezzo si mostra IVA esclusa alle aziende e IVA inclusa ai privati.
 *
 * Componente di presentazione: non legge il client né il Provider, riceve il listino e le
 * funzioni. Così lo stesso form serve sia a `SubscribeStep` (login, con il client reale) sia
 * all'anteprima della dashboard admin, che lo monta con `preview` e senza `onSubmit`.
 *
 * Gli importi dell'ordine li calcola sempre hub: `onQuote` chiede il prezzo a ogni cambio di
 * scelta. Finché la risposta non arriva il riepilogo usa gli importi di vetrina del listino.
 * La validazione di qui (stessi algoritmi di hub, `core/fiscal.ts`) serve solo a segnalare
 * l'errore subito: l'ultima parola è del server, i cui errori di campo si mostrano sotto il
 * campo giusto.
 */
import type { AddressDetails, AddressSuggestion, BillingCatalog, BillingOrder, BillingQuote, BillingSelection } from '../core/index.js';
import { type HubAuthMessages } from './messages.js';
export interface SubscribePickerProps {
    /** Listino di hub (GET /billing/catalog) */
    catalog: BillingCatalog;
    /** Prezzo di una scelta (POST /billing/quote); un errore lascia il riepilogo con gli importi di vetrina */
    onQuote: (selection: BillingSelection) => Promise<BillingQuote>;
    /** Invio dell'ordine; senza, il pulsante controlla i dati e mostra l'avviso di anteprima */
    onSubmit?: (order: BillingOrder) => Promise<void>;
    /** Suggerimenti di indirizzo (client.suggestAddress); senza, l'indirizzo si scrive a mano */
    onSuggestAddress?: (query: string, session: string) => Promise<AddressSuggestion[]>;
    onAddressDetails?: (placeId: string, session: string) => Promise<AddressDetails | null>;
    /** Anteprima: i dati si controllano ma l'ordine non parte, e lo dice un avviso */
    preview?: boolean;
    /** Pagamento in corso (blocca il form) */
    busy?: boolean;
    /** false: solo scelta e dati, senza presentazione e domande frequenti (default true) */
    landing?: boolean;
    messages?: Partial<HubAuthMessages>;
}
export declare function SubscribePicker({ catalog, onQuote, onSubmit, onSuggestAddress, onAddressDetails, preview, busy, landing, messages: custom, }: SubscribePickerProps): import("react").JSX.Element;
