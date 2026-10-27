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

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
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

/** Token di sessione per Google (8-64 caratteri [A-Za-z0-9_-]) */
function newSession(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40).padEnd(8, '0');
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

export function AddressAutocomplete({
  id, value, onChange, onBlur, onPick, suggest, details, messages, placeholder, invalid, describedBy, disabled,
}: AddressAutocompleteProps) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const session = useRef(newSession());
  // Conta le ricerche: la risposta di una ricerca superata si scarta
  const searchId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    searchId.current += 1;
    const mine = searchId.current;
    const query = text.replace(/\s+/g, ' ').trim();
    if (query.length < MIN_CHARS) {
      close();
      return;
    }
    timer.current = setTimeout(() => {
      suggest(query, session.current)
        .then((result) => {
          if (mine !== searchId.current) return;
          setItems(result.slice(0, 5));
          setActive(-1);
          setOpen(result.length > 0);
        })
        // Servizio non raggiungibile: si prosegue a mano
        .catch(() => { if (mine === searchId.current) close(); });
    }, DEBOUNCE_MS);
  };

  // Solo il testo scritto dall'utente avvia una ricerca: la scelta di un suggerimento cambia il valore
  // dal di fuori (onPick) e non passa di qui
  const handleChange = (text: string) => {
    onChange(text);
    search(text);
  };

  const pick = (item: AddressSuggestion) => {
    close();
    searchId.current += 1;
    const sessionUsed = session.current;
    // La sessione di Google si chiude con la scelta: la prossima ricerca ne apre una nuova
    session.current = newSession();
    details(item.place_id, sessionUsed)
      .then((result) => {
        if (result) onPick(result);
        else onChange(item.text.split(',')[0] ?? item.text);
      })
      .catch(() => onChange(item.text.split(',')[0] ?? item.text));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const item = items[active];
      if (item) pick(item);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return (
    <>
      <input
        id={id}
        className="hub-auth__ck-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        // Un attimo di ritardo: il clic su un suggerimento deve arrivare prima della chiusura
        onBlur={() => { window.setTimeout(close, 120); onBlur(); }}
      />
      <ul id={listId} className="hub-auth__ck-suggestions" role="listbox" aria-label={messages.ckSuggestions} hidden={!open}>
        {items.map((item, i) => (
          <li key={item.place_id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            onMouseDown={(e) => { e.preventDefault(); pick(item); }}>
            {item.text}
          </li>
        ))}
        <li className="hub-auth__ck-suggestions-foot" aria-hidden="true">{messages.ckPoweredByGoogle}</li>
      </ul>
    </>
  );
}
