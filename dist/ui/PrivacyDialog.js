import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Modale con il testo completo dell'informativa privacy (dalla 1.5.0).
 *
 * Usa l'elemento <dialog> nativo aperto con showModal(): focus trap, tasto Esc e
 * sfondo oscurato sono del browser. Il testo arriva da hub (GET /auth/tool-config)
 * ed è già suddiviso in paragrafi da RegisterStep; un paragrafo "Titolo\ntesto"
 * mostra il titolo su una riga propria, in grassetto.
 */
import { useEffect, useRef } from 'react';
export function PrivacyDialog({ messages, paragraphs, onClose, onAccept }) {
    const dialogRef = useRef(null);
    // Apertura modale al montaggio. Il ripiego sull'attributo open serve agli
    // ambienti senza showModal (es. jsdom nei test dei progetti che usano la libreria)
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog || dialog.open)
            return;
        if (typeof dialog.showModal === 'function')
            dialog.showModal();
        else
            dialog.setAttribute('open', '');
    }, []);
    return (_jsx("dialog", { ref: dialogRef, className: "hub-auth__dialog", "aria-labelledby": "hub-auth-privacy-title", 
        // Esc: il browser chiude il dialog e lancia "close", qui riportato al form
        onClose: onClose, 
        // Il dialog riempie lo sfondo oscurato: un clic su di esso (non sul contenuto) chiude
        onClick: (event) => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: "hub-auth__dialog-box", children: [_jsx("h3", { id: "hub-auth-privacy-title", className: "hub-auth__dialog-title", children: messages.privacyTitle }), _jsx("div", { className: "hub-auth__dialog-body", tabIndex: 0, children: paragraphs.map((text, index) => {
                        const [first, ...rest] = text.split('\n');
                        return rest.length > 0 ? (_jsxs("p", { className: "hub-auth__privacy-text", children: [_jsx("strong", { className: "hub-auth__privacy-heading", children: first.trim() }), rest.join(' ').trim()] }, index)) : (_jsx("p", { className: "hub-auth__privacy-text", children: text }, index));
                    }) }), _jsxs("div", { className: "hub-auth__dialog-actions", children: [_jsx("button", { className: "hub-auth__button hub-auth__button--secondary", type: "button", onClick: onClose, children: messages.privacyClose }), _jsx("button", { className: "hub-auth__button", type: "button", onClick: onAccept, children: messages.privacyAccept })] })] }) }));
}
