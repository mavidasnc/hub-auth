import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Conferma di registrazione con account da approvare: l'utente è in stato
 * "pending" finché un amministratore non lo attiva; lo avvisa una email.
 */
import { useHubAuth } from '../react/index.js';
import { format, mergeMessages } from './messages.js';
export function RegisteredStep({ messages: custom }) {
    const messages = mergeMessages(custom);
    const { pendingEmail, resetToEmail } = useHubAuth();
    return (_jsxs("div", { className: "hub-auth__form", children: [_jsx("h2", { className: "hub-auth__heading", children: messages.registeredTitle }), _jsx("p", { className: "hub-auth__text", role: "status", children: format(messages.registeredText, { email: pendingEmail }) }), _jsx("button", { className: "hub-auth__button", type: "button", onClick: resetToEmail, children: messages.backToLogin })] }));
}
