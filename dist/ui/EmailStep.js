import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Primo passo del login: richiesta del codice OTP via email.
 *
 * otp-request risponde 200 anche per email sconosciute (anti-enumerazione):
 * qui non si può distinguere "email non registrata" da "email valida", per design.
 */
import { useState } from 'react';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages } from './messages.js';
export function EmailStep({ messages: custom, signup = true }) {
    const messages = mergeMessages(custom);
    const { requestOtp, startRegister, toolConfig, loading } = useHubAuth();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    /** Handler: invio del form, la validazione dell'email la fa il client */
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await requestOtp(email);
        }
        catch (err) {
            setError(errorMessage(err, messages, 'email'));
        }
    };
    return (_jsxs("form", { className: "hub-auth__form", onSubmit: handleSubmit, noValidate: true, children: [_jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-email", children: messages.emailLabel }), _jsx("input", { id: "hub-auth-email", className: "hub-auth__input", type: "email", autoComplete: "email", placeholder: messages.emailPlaceholder, value: email, onChange: (e) => setEmail(e.target.value), disabled: loading, autoFocus: true, required: true }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), _jsx("button", { className: "hub-auth__button", type: "submit", disabled: loading || !email.trim(), children: loading ? messages.sending : messages.sendCode }), _jsx("p", { className: "hub-auth__hint", children: messages.codeHint }), signup && toolConfig?.signup_enabled && (_jsx("div", { className: "hub-auth__links hub-auth__links--center", children: _jsx("button", { className: "hub-auth__link", type: "button", onClick: startRegister, disabled: loading, children: messages.signupLink }) }))] }));
}
