import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages } from './messages.js';
import { SubscribePicker } from './SubscribePicker.js';
export function SubscribeStep({ messages: custom }) {
    const messages = mergeMessages(custom);
    const { loadBillingCatalog, billingQuote, startCheckout, suggestAddress, addressDetails, resetToEmail, loading, } = useHubAuth();
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let current = true;
        loadBillingCatalog()
            .then((result) => { if (current)
            setCatalog(result); })
            .catch((err) => { if (current)
            setError(errorMessage(err, messages, 'subscribe')); });
        return () => { current = false; };
        // Il listino si carica una volta per apertura dello step
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadBillingCatalog]);
    return (_jsxs("div", { className: "hub-auth__form", children: [!catalog && !error && _jsx("p", { className: "hub-auth__text", role: "status", children: messages.subscribeLoading }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error || messages.subscribeUnavailable }), catalog && !catalog.enabled && (_jsx("p", { className: "hub-auth__error", role: "alert", children: messages.subscribeUnavailable })), catalog && catalog.enabled && (_jsx(SubscribePicker, { catalog: catalog, onQuote: billingQuote, onSubmit: startCheckout, onSuggestAddress: suggestAddress, onAddressDetails: addressDetails, busy: loading, messages: custom })), _jsx("div", { className: "hub-auth__links hub-auth__links--center", children: _jsx("button", { className: "hub-auth__link", type: "button", onClick: resetToEmail, disabled: loading, children: messages.backToLogin }) })] }));
}
