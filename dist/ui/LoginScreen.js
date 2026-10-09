import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Schermata di login completa: card con logo, titolo, avviso di logout
 * forzato e lo step corrente del flusso (email, codice, magic link,
 * registrazione).
 *
 * Layout a due metà (dalla 1.3.0): quando c'è un pannello da mostrare, a
 * sinistra compare il pannello (logo, descrizione, avvisi o altro) e a destra il
 * login, in un contenitore largo al massimo 1200px (`--hub-auth-split-max-width`);
 * sotto i 900px il login passa sopra e il pannello sotto. Il pannello
 * si personalizza in due modi:
 * - dal database di hub, senza toccare l'app: descrizione e avviso del tool
 *   (GET /auth/tool-config, modificabili dalla tab Tools di admin-dashboard)
 * - dall'app, con la prop `aside` (sostituisce il pannello di default)
 * Senza né l'uno né l'altro la schermata resta la card centrata di sempre.
 *
 * Dalla 1.8.0: `asideImage` (immagine nel pannello di default), `ecosystem` (blocco
 * "Le altre app Mavida" sotto la card) e landmark semantici (`<main>`, `<footer>`).
 */
import { useEffect } from 'react';
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { LinkStep } from './LinkStep.js';
import { OtpStep } from './OtpStep.js';
import { RegisteredStep } from './RegisteredStep.js';
import { RegisterStep } from './RegisterStep.js';
import { EcosystemNav } from './EcosystemMenu.js';
import { mergeMessages } from './messages.js';
/** Pannello di default: logo dell'app, etichetta, descrizione e avviso del tool (da hub) */
function DefaultAside({ logo, image, link }) {
    const { toolConfig } = useHubAuth();
    const tool = toolConfig?.tool;
    return (_jsxs(_Fragment, { children: [logo && _jsx("div", { className: "hub-auth__aside-logo", children: logo }), tool?.label && _jsx("h2", { className: "hub-auth__aside-title", children: tool.label }), tool?.description && _jsx("p", { className: "hub-auth__aside-text", children: tool.description }), tool?.login_notice && _jsx("p", { className: "hub-auth__aside-notice", role: "note", children: tool.login_notice }), image && (_jsx("img", { className: "hub-auth__aside-image", src: image.src, alt: image.alt, width: image.width, height: image.height, decoding: "async" })), link && (_jsxs("a", { className: "hub-auth__aside-cta", href: link.href, children: [link.label, _jsx("span", { className: "hub-auth__aside-cta-arrow", "aria-hidden": "true", children: "\u2192" })] }))] }));
}
export function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className = '', aside, layout = 'auto', signup = true, asideImage, asideLink, ecosystem = false, }) {
    const messages = mergeMessages(custom);
    const { step, notice, toolConfig, loadToolConfig, client } = useHubAuth();
    // Pannello e registrazione dipendono dalla configurazione pubblica di hub:
    // si carica solo qui, quando la schermata di login è davvero mostrata
    useEffect(() => {
        void loadToolConfig();
    }, [loadToolConfig]);
    const tool = toolConfig?.tool;
    const hasAside = aside != null || !!(tool?.description || tool?.login_notice || asideImage || asideLink);
    const split = layout === 'split' || (layout === 'auto' && hasAside);
    // Con il pannello di default il logo sta nel pannello (e si toglie dalla card sopra i 900px);
    // con un `aside` personalizzato resta nella card, che è l'unico posto dove l'app lo mette.
    const logoInAside = split && aside == null && !!logo;
    const card = (_jsxs("div", { className: "hub-auth__card", children: [(logo || title || subtitle) && (_jsxs("header", { className: "hub-auth__header", children: [logo && _jsx("div", { className: "hub-auth__logo", children: logo }), title && _jsx("h1", { className: "hub-auth__title", children: title }), subtitle && _jsx("p", { className: "hub-auth__subtitle", children: subtitle })] })), notice && step === 'email' && (_jsx("p", { className: "hub-auth__notice", role: "status", children: messages.notice[notice] })), step === 'email' && _jsx(EmailStep, { messages: custom, signup: signup }), step === 'otp' && _jsx(OtpStep, { messages: custom, resendCooldown: resendCooldown, signup: signup }), step === 'link' && _jsx(LinkStep, { messages: custom }), step === 'register' && _jsx(RegisterStep, { messages: custom }), step === 'registered' && _jsx(RegisteredStep, { messages: custom })] }));
    // Footer sotto la card: testo dell'app e, se richiesto, i link alle altre app dell'ecosistema
    const footerNode = (footer || ecosystem) && (_jsxs("footer", { className: "hub-auth__footer", children: [footer, ecosystem && _jsx(EcosystemNav, { current: client.tool ?? tool?.key, messages: custom })] }));
    if (!split) {
        return (_jsxs("main", { className: `hub-auth ${className}`.trim(), children: [card, footerNode] }));
    }
    return (_jsx("div", { className: `hub-auth hub-auth--split${logoInAside ? ' hub-auth--logo-aside' : ''} ${className}`.trim(), children: _jsxs("div", { className: "hub-auth__split", children: [_jsx("aside", { className: "hub-auth__aside", children: _jsx("div", { className: "hub-auth__aside-content", children: aside ?? _jsx(DefaultAside, { logo: logo, image: asideImage, link: asideLink }) }) }), _jsxs("main", { className: "hub-auth__main", children: [card, footerNode] })] }) }));
}
