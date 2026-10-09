import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, in un box scorrevole,
 * suddiviso in paragrafi dalle righe vuote. La versione del testo mostrato
 * viaggia con la richiesta di registrazione (la gestisce il client).
 */
import { useState } from 'react';
import { HubAuthError } from '../core/index.js';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages } from './messages.js';
export function RegisterStep({ messages: custom }) {
    const messages = mergeMessages(custom);
    const { register, resetToEmail, toolConfig, loading } = useHubAuth();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [error, setError] = useState('');
    const paragraphs = (toolConfig?.privacy?.text ?? '').split(/\n\s*\n/).filter((p) => p.trim());
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
    return (_jsxs("form", { className: "hub-auth__form", onSubmit: handleSubmit, noValidate: true, children: [_jsx("h2", { className: "hub-auth__heading", children: messages.registerTitle }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-username", children: messages.usernameLabel }), _jsx("input", { id: "hub-auth-username", className: "hub-auth__input", type: "text", autoComplete: "name", placeholder: messages.usernamePlaceholder, value: username, onChange: (e) => setUsername(e.target.value), disabled: loading, autoFocus: true, required: true }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-register-email", children: messages.emailLabel }), _jsx("input", { id: "hub-auth-register-email", className: "hub-auth__input", type: "email", autoComplete: "email", placeholder: messages.emailPlaceholder, value: email, onChange: (e) => setEmail(e.target.value), disabled: loading, required: true }), paragraphs.length > 0 && (_jsx("div", { className: "hub-auth__privacy", tabIndex: 0, role: "region", "aria-label": messages.privacyTitle, children: paragraphs.map((text, index) => (_jsx("p", { className: "hub-auth__privacy-text", children: text }, index))) })), _jsxs("label", { className: "hub-auth__check", children: [_jsx("input", { type: "checkbox", checked: accepted, onChange: (e) => setAccepted(e.target.checked), disabled: loading }), _jsx("span", { children: messages.privacyLabel })] }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), _jsx("button", { className: "hub-auth__button", type: "submit", disabled: loading || !username.trim() || !email.trim() || !accepted, children: loading ? messages.registering : messages.register }), _jsx("div", { className: "hub-auth__links hub-auth__links--center", children: _jsx("button", { className: "hub-auth__link", type: "button", onClick: resetToEmail, disabled: loading, children: messages.loginLink }) })] }));
}
