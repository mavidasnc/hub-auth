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

import { useEffect, useState } from 'react';
import type { BillingCatalog } from '../core/index.js';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';
import { SubscribePicker } from './SubscribePicker.js';

export interface SubscribeStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function SubscribeStep({ messages: custom }: SubscribeStepProps) {
  const messages = mergeMessages(custom);
  const {
    loadBillingCatalog, billingQuote, startCheckout, suggestAddress, addressDetails, resetToEmail, loading,
  } = useHubAuth();
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    loadBillingCatalog()
      .then((result) => { if (current) setCatalog(result); })
      .catch((err) => { if (current) setError(errorMessage(err, messages, 'subscribe')); });
    return () => { current = false; };
    // Il listino si carica una volta per apertura dello step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBillingCatalog]);

  return (
    <div className="hub-auth__form">
      {!catalog && !error && <p className="hub-auth__text" role="status">{messages.subscribeLoading}</p>}
      {error && <p className="hub-auth__error" role="alert">{error || messages.subscribeUnavailable}</p>}
      {catalog && !catalog.enabled && (
        <p className="hub-auth__error" role="alert">{messages.subscribeUnavailable}</p>
      )}
      {catalog && catalog.enabled && (
        <SubscribePicker
          catalog={catalog}
          onQuote={billingQuote}
          onSubmit={startCheckout}
          onSuggestAddress={suggestAddress}
          onAddressDetails={addressDetails}
          busy={loading}
          messages={custom}
        />
      )}
      <div className="hub-auth__links hub-auth__links--center">
        <button className="hub-auth__link" type="button" onClick={resetToEmail} disabled={loading}>
          {messages.backToLogin}
        </button>
      </div>
    </div>
  );
}
