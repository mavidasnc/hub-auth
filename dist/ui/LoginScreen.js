import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (descrizione, avvisi o altro) e a destra il
 * login; sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 */
import { useEffect } from 'react';
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { LinkStep } from './LinkStep.js';
import { OtpStep } from './OtpStep.js';
import { RegisteredStep } from './RegisteredStep.js';
import { RegisterStep } from './RegisterStep.js';
import { mergeMessages } from './messages.js';
/** Pannello di default: etichetta, descrizione e avviso del tool, da hub */
function DefaultAside() {
    const { toolConfig } = useHubAuth();
    const tool = toolConfig?.tool;
    if (!tool)
        return null;
    return (_jsxs(_Fragment, { children: [tool.label && _jsx("h2", { className: "hub-auth__aside-title", children: tool.label }), tool.description && _jsx("p", { className: "hub-auth__aside-text", children: tool.description }), tool.login_notice && _jsx("p", { className: "hub-auth__aside-notice", role: "note", children: tool.login_notice })] }));
}
export function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className = '', aside, layout = 'auto', signup = true, }) {
    const messages = mergeMessages(custom);
    const { step, notice, toolConfig, loadToolConfig } = useHubAuth();
    // Pannello e registrazione dipendono dalla configurazione pubblica di hub:
    // si carica solo qui, quando la schermata di login è davvero mostrata
    useEffect(() => {
        void loadToolConfig();
    }, [loadToolConfig]);
    const tool = toolConfig?.tool;
    const hasAside = aside != null || !!(tool?.description || tool?.login_notice);
    const split = layout === 'split' || (layout === 'auto' && hasAside);
    const card = (_jsxs("div", { className: "hub-auth__card", children: [(logo || title || subtitle) && (_jsxs("header", { className: "hub-auth__header", children: [logo && _jsx("div", { className: "hub-auth__logo", children: logo }), title && _jsx("h1", { className: "hub-auth__title", children: title }), subtitle && _jsx("p", { className: "hub-auth__subtitle", children: subtitle })] })), notice && step === 'email' && (_jsx("p", { className: "hub-auth__notice", role: "status", children: messages.notice[notice] })), step === 'email' && _jsx(EmailStep, { messages: custom, signup: signup }), step === 'otp' && _jsx(OtpStep, { messages: custom, resendCooldown: resendCooldown }), step === 'link' && _jsx(LinkStep, { messages: custom }), step === 'register' && _jsx(RegisterStep, { messages: custom }), step === 'registered' && _jsx(RegisteredStep, { messages: custom })] }));
    const footerNode = footer && _jsx("div", { className: "hub-auth__footer", children: footer });
    if (!split) {
        return (_jsxs("div", { className: `hub-auth ${className}`.trim(), children: [card, footerNode] }));
    }
    return (_jsxs("div", { className: `hub-auth hub-auth--split ${className}`.trim(), children: [_jsx("aside", { className: "hub-auth__aside", children: _jsx("div", { className: "hub-auth__aside-content", children: aside ?? _jsx(DefaultAside, {}) }) }), _jsxs("div", { className: "hub-auth__main", children: [card, footerNode] })] }));
}
