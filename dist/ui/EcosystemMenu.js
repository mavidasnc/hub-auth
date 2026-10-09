import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Collegamenti alle altre app dell'ecosistema Mavida (dalla 1.8.0).
 *
 * - `EcosystemNav`: elenco di link in un `<nav>`, per il footer del login e per le
 *   pagine pubbliche. Sono link normali (visibili anche ai crawler).
 * - `EcosystemMenu`: pulsante con elenco da mettere nell'header o nella sidebar di
 *   un'app dopo il login. Due varianti: 'dropdown' (default, tendina assoluta per un
 *   header) e 'inline' (elenco nel flusso, per sidebar con overflow nascosto, dove una
 *   tendina verrebbe tagliata). Si chiude con Esc o con un clic fuori (solo dropdown).
 *
 * Il tema della tendina si cambia con le variabili `--hub-auth-eco-*` o con
 * `theme="dark"`; funziona anche fuori da `.hub-auth` (basta importare ui.css).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { otherApps } from './ecosystem.js';
import { mergeMessages } from './messages.js';
export function EcosystemNav({ current, messages: custom, className = '' }) {
    const messages = mergeMessages(custom);
    const apps = otherApps(current);
    if (apps.length === 0)
        return null;
    return (_jsxs("nav", { className: `hub-auth__ecosystem ${className}`.trim(), "aria-label": messages.ecosystemTitle, children: [_jsx("p", { className: "hub-auth__ecosystem-title", children: messages.ecosystemTitle }), _jsx("ul", { className: "hub-auth__ecosystem-list", children: apps.map((app) => (_jsx("li", { children: _jsxs("a", { href: app.url, title: app.tagline, className: "hub-auth__ecosystem-link", children: [_jsx("span", { className: "hub-auth__ecosystem-dot", style: { background: app.color }, "aria-hidden": "true" }), app.name] }) }, app.key))) })] }));
}
export function EcosystemMenu({ current, variant = 'dropdown', theme = 'light', align = 'start', label, messages: custom, className = '', }) {
    const messages = mergeMessages(custom);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const listId = useId();
    const apps = otherApps(current);
    // Chiusura con Esc o con un clic fuori, solo mentre la tendina è aperta (nella variante
    // inline l'elenco resta aperto finché non si richiude il pulsante)
    useEffect(() => {
        if (!open || variant === 'inline')
            return;
        const onKey = (event) => { if (event.key === 'Escape')
            setOpen(false); };
        const onClick = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target))
                setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onClick);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onClick);
        };
    }, [open, variant]);
    if (apps.length === 0)
        return null;
    return (_jsxs("div", { ref: rootRef, className: `hub-auth-eco hub-auth-eco--${variant} hub-auth-eco--${theme} hub-auth-eco--${align} ${className}`.trim(), children: [_jsxs("button", { type: "button", className: "hub-auth-eco__button", "aria-expanded": open, "aria-controls": listId, onClick: () => setOpen((value) => !value), children: [label ?? messages.ecosystemMenu, _jsx("span", { className: "hub-auth-eco__chevron", "aria-hidden": "true", children: "\u25BE" })] }), open && (_jsx("ul", { id: listId, className: "hub-auth-eco__list", children: apps.map((app) => (_jsx("li", { children: _jsxs("a", { href: app.url, title: app.tagline, className: "hub-auth-eco__link", onClick: () => setOpen(false), children: [_jsx("span", { className: "hub-auth-eco__dot", style: { background: app.color }, "aria-hidden": "true" }), _jsxs("span", { className: "hub-auth-eco__text", children: [_jsx("span", { className: "hub-auth-eco__name", children: app.name }), _jsx("span", { className: "hub-auth-eco__tagline", children: app.tagline })] })] }) }, app.key))) }))] }));
}
