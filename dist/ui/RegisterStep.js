import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, per intero, in una
 * modale (dalla 1.5.0) aperta dal link nella frase del consenso o dal pulsante
 * sotto la casella, suddiviso in paragrafi dalle righe vuote. La versione del
 * testo mostrato viaggia con la richiesta di registrazione (la gestisce il client).
 */
import { useRef, useState } from 'react';
import { HubAuthError } from '../core/index.js';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages } from './messages.js';
import { PrivacyDialog } from './PrivacyDialog.js';
export function RegisterStep({ messages: custom }) {
    const messages = mergeMessages(custom);
    const { register, resetToEmail, toolConfig, pendingEmail, loading } = useHubAuth();
    const [username, setUsername] = useState('');
    // Chi arriva dal passo del codice ha già scritto l'email: non va riscritta
    const [email, setEmail] = useState(pendingEmail);
    const [accepted, setAccepted] = useState(false);
    const [error, setError] = useState('');
    const [privacyOpen, setPrivacyOpen] = useState(false);
    // Pulsante che ha aperto la modale: alla chiusura il focus torna lì
    const trigger = useRef(null);
    const paragraphs = (toolConfig?.privacy?.text ?? '').split(/\n\s*\n/).filter((p) => p.trim());
    const hasPrivacyText = paragraphs.length > 0;
    // La frase del consenso può contenere {link}: diventa il pulsante dell'informativa
    const labelParts = messages.privacyLabel.split('{link}');
    /** Handler: apre la modale. Dentro la <label> evita che il clic cambi la spunta */
    const openPrivacy = (event) => {
        event.preventDefault();
        trigger.current = event.currentTarget;
        setPrivacyOpen(true);
    };
    /** Handler: chiude la modale e riporta il focus al pulsante che l'ha aperta */
    const closePrivacy = () => {
        setPrivacyOpen(false);
        trigger.current?.focus();
    };
    /** Handler: invio del form, la validazione dei campi la fa il client */
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await register({ username, email, privacyAccepted: accepted });
        }
        catch (err) {
            setError(errorMessage(err, messages, 'register'));
            // Con l'informativa aggiornata la spunta data sul testo vecchio non vale più
            if (err instanceof HubAuthError && err.code === 'PrivacyVersionMismatch')
                setAccepted(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("form", { className: "hub-auth__form", onSubmit: handleSubmit, noValidate: true, children: [_jsx("h2", { className: "hub-auth__heading", children: messages.registerTitle }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-username", children: messages.usernameLabel }), _jsx("input", { id: "hub-auth-username", className: "hub-auth__input", type: "text", autoComplete: "name", placeholder: messages.usernamePlaceholder, value: username, onChange: (e) => setUsername(e.target.value), disabled: loading, autoFocus: true, required: true }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-register-email", children: messages.emailLabel }), _jsx("input", { id: "hub-auth-register-email", className: "hub-auth__input", type: "email", autoComplete: "email", placeholder: messages.emailPlaceholder, value: email, onChange: (e) => setEmail(e.target.value), disabled: loading, required: true }), _jsxs("label", { className: "hub-auth__check", children: [_jsx("input", { type: "checkbox", checked: accepted, onChange: (e) => setAccepted(e.target.checked), disabled: loading }), _jsx("span", { children: labelParts.length === 2 ? (_jsxs(_Fragment, { children: [labelParts[0], hasPrivacyText ? (_jsx("button", { className: "hub-auth__link hub-auth__link--inline", type: "button", onClick: openPrivacy, children: messages.privacyLinkText })) : messages.privacyLinkText, labelParts[1]] })) : messages.privacyLabel })] }), hasPrivacyText && (_jsx("button", { className: "hub-auth__link hub-auth__link--block", type: "button", onClick: openPrivacy, children: messages.privacyOpen })), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), _jsx("button", { className: "hub-auth__button", type: "submit", disabled: loading || !username.trim() || !email.trim() || !accepted, children: loading ? messages.registering : messages.register }), _jsx("div", { className: "hub-auth__links hub-auth__links--center", children: _jsx("button", { className: "hub-auth__link", type: "button", onClick: resetToEmail, disabled: loading, children: messages.loginLink }) })] }), privacyOpen && (_jsx(PrivacyDialog, { messages: messages, paragraphs: paragraphs, onClose: closePrivacy, onAccept: () => { setAccepted(true); closePrivacy(); } }))] }));
}
