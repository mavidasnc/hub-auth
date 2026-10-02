import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Conferma dell'accesso con il magic link dell'email OTP.
 *
 * Il link NON accede da solo: l'utente deve premere il pulsante. Così uno
 * scanner antiphishing del client email, che apre il link ed esegue il
 * JavaScript senza cliccare nulla, non consuma il token monouso.
 */
import { useState } from 'react';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages } from './messages.js';
export function LinkStep({ messages: custom }) {
    const messages = mergeMessages(custom);
    const { verifyLink, cancelLink, loading } = useHubAuth();
    const [error, setError] = useState('');
    /** Handler: conferma dell'utente; i link non più validi li gestisce il client (notice) */
    const handleConfirm = async () => {
        setError('');
        try {
            await verifyLink();
        }
        catch (err) {
            setError(errorMessage(err, messages, 'link'));
        }
    };
    return (_jsxs("div", { className: "hub-auth__form", children: [_jsx("p", { className: "hub-auth__text", children: messages.linkIntro }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), _jsx("button", { className: "hub-auth__button", type: "button", onClick: handleConfirm, disabled: loading, autoFocus: true, children: loading ? messages.linkSigning : messages.linkConfirm }), _jsx("div", { className: "hub-auth__links", children: _jsx("button", { className: "hub-auth__link", type: "button", onClick: cancelLink, disabled: loading, children: messages.linkUseCode }) })] }));
}
