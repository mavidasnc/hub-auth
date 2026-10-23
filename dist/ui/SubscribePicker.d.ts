/**
 * Scelta dell'abbonamento e dati di fatturazione (dalla 1.14.0).
 *
 * Componente di presentazione: non legge il client né il Provider, riceve il listino
 * e due funzioni. Così lo stesso form serve sia a `SubscribeStep` (login, con il client
 * reale) sia all'anteprima della dashboard admin, che lo monta con `preview` e senza
 * `onSubmit` per vedere la pagina di pagamento senza poter comprare nulla.
 *
 * Gli importi non si calcolano qui: ogni cambio di scelta chiede il prezzo a hub
 * (`onQuote`), che lo calcola dal listino salvato nel database. Fanno eccezione i soli
 * importi di vetrina di ogni piano (mensile e annuale, mensile x `months`).
 *
 * Dalla 1.15.0 i piani sono tre colonne con descrizione, listino, mensile e annuale. Le app
 * si scelgono (e c'è l'opzione "solo app") solo se il listino ne offre: con `apps` vuoto, come
 * nella prima fase dei pagamenti, resta la scelta del piano e una riga sulle app incluse.
 */
import type { BillingCatalog, BillingOrder, BillingQuote, BillingSelection } from '../core/index.js';
import { type HubAuthMessages } from './messages.js';
export interface SubscribePickerProps {
    /** Listino di hub (GET /billing/catalog) */
    catalog: BillingCatalog;
    /** Prezzo di una scelta (POST /billing/quote); un errore lascia il riepilogo vuoto */
    onQuote: (selection: BillingSelection) => Promise<BillingQuote>;
    /** Invio dell'ordine; se manca il pulsante di pagamento resta disattivato */
    onSubmit?: (order: BillingOrder) => Promise<void>;
    /** Anteprima: il pulsante di pagamento è disattivato e lo dice un avviso */
    preview?: boolean;
    /** Pagamento in corso (blocca il form) */
    busy?: boolean;
    messages?: Partial<HubAuthMessages>;
}
export declare function SubscribePicker({ catalog, onQuote, onSubmit, preview, busy, messages: custom, }: SubscribePickerProps): import("react").JSX.Element;
