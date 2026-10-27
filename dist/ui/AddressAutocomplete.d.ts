/**
 * Campo «Indirizzo» con suggerimenti (combobox accessibile), dalla 1.17.0.
 *
 * I suggerimenti vengono da hub (GET /billing/address/suggest, che a sua volta usa Google
 * Places): il browser non parla mai con Google. Una ricerca ogni pausa di digitazione
 * (250 ms), da 3 caratteri, scartando le risposte di una ricerca vecchia. Le due chiamate
 * (suggest e details) dividono lo stesso token di sessione, che Google fattura come una
 * sola richiesta. L'inserimento a mano resta sempre possibile: se il servizio non risponde
 * l'elenco semplicemente non compare.
 */
import type { AddressDetails, AddressSuggestion } from '../core/index.js';
import { type HubAuthMessages } from './messages.js';
export interface AddressAutocompleteProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    /** Indirizzo scelto dall'elenco: riempie anche CAP, città e provincia */
    onPick: (details: AddressDetails) => void;
    suggest: (query: string, session: string) => Promise<AddressSuggestion[]>;
    details: (placeId: string, session: string) => Promise<AddressDetails | null>;
    messages: HubAuthMessages;
    placeholder?: string;
    invalid?: boolean;
    describedBy?: string;
    disabled?: boolean;
}
export declare function AddressAutocomplete({ id, value, onChange, onBlur, onPick, suggest, details, messages, placeholder, invalid, describedBy, disabled, }: AddressAutocompleteProps): import("react").JSX.Element;
