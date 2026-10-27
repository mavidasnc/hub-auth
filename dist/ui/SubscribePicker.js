import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Pagina di pagamento: scelta dell'abbonamento, dati di fatturazione e ordine.
 *
 * Dalla 1.17.0 è una landing in stile Mavida (tema scuro, acquamarina) con tipo di cliente
 * (azienda o privato), controlli sui dati fiscali, suggerimento dell'indirizzo, consensi di
 * legge e pulsante «Ordina con obbligo di pagamento» sempre attivo (gli errori compaiono al
 * clic). Il prezzo si mostra IVA esclusa alle aziende e IVA inclusa ai privati.
 *
 * Componente di presentazione: non legge il client né il Provider, riceve il listino e le
 * funzioni. Così lo stesso form serve sia a `SubscribeStep` (login, con il client reale) sia
 * all'anteprima della dashboard admin, che lo monta con `preview` e senza `onSubmit`.
 *
 * Gli importi dell'ordine li calcola sempre hub: `onQuote` chiede il prezzo a ogni cambio di
 * scelta. Finché la risposta non arriva il riepilogo usa gli importi di vetrina del listino.
 * La validazione di qui (stessi algoritmi di hub, `core/fiscal.ts`) serve solo a segnalare
 * l'errore subito: l'ultima parola è del server, i cui errori di campo si mostrano sotto il
 * campo giusto.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { PROVINCES, cleanText, isValidEmail, isValidPersonTaxCode, isValidProvince, isValidSdi, isValidTaxCode, isValidVat, isValidZip, normalizeTaxCode, normalizeVat, } from '../core/fiscal.js';
import { HubAuthError } from '../core/index.js';
import { AddressAutocomplete } from './AddressAutocomplete.js';
import { errorMessage, format, mergeMessages } from './messages.js';
/** Valore del radio "solo app" */
const NO_FLEET = '__none__';
const EMPTY = {
    companyName: '', firstName: '', lastName: '', vat: '', taxCode: '', address: '', zip: '',
    city: '', province: '', sdi: '', pec: '',
};
/** Campi dell'ordine di hub (loc di un errore 400) -> campi del modulo */
const SERVER_FIELD = {
    billing_name: 'companyName', vat_number: 'vat', tax_code: 'taxCode', sdi_code: 'sdi', pec_email: 'pec',
    billing_address: 'address', billing_zip: 'zip', billing_city: 'city', billing_province: 'province',
    terms_accepted: 'terms', business_declaration: 'business', immediate_start_requested: 'immediate',
};
/** Importo in centesimi nel formato della valuta (es. "288,00 €") */
function money(cents, currency) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(cents / 100);
}
/** Data ISO (YYYY-MM-DD) in formato italiano, senza spostamenti di fuso */
function italianDate(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
}
/** "1 mese" / "3 mesi" */
function monthsLabel(months) {
    return months === 1 ? '1 mese' : `${months} mesi`;
}
/** Sostituisce {nome} con un nodo (es. un link) dentro un testo dei messaggi */
function withNodes(template, nodes) {
    return template.split(/(\{\w+\})/).map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        return _jsx(Fragment, { children: key && key in nodes ? nodes[key] : part }, i);
    });
}
/** Link che si apre in una scheda nuova; senza indirizzo resta testo semplice */
function legalLink(href, label) {
    return href
        ? _jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", children: label })
        : _jsx("span", { children: label });
}
export function SubscribePicker({ catalog, onQuote, onSubmit, onSuggestAddress, onAddressDetails, preview = false, busy = false, landing = true, messages: custom, }) {
    const messages = mergeMessages(custom);
    const legal = catalog.legal;
    const withdrawalDays = legal?.withdrawal_days ?? 14;
    const rootRef = useRef(null);
    // Si parte dal piano in evidenza (il secondo se ce ne sono tre) o dal primo
    const [plan, setPlan] = useState((catalog.plans.length === 3 ? catalog.plans[1] : catalog.plans[0])?.code ?? NO_FLEET);
    const [apps, setApps] = useState([]);
    const [quote, setQuote] = useState(null);
    const [type, setType] = useState('company');
    const [values, setValues] = useState(EMPTY);
    const [consents, setConsents] = useState({ terms: false, business: false, immediate: false });
    const [touched, setTouched] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [serverErrors, setServerErrors] = useState({});
    const [error, setError] = useState('');
    const [previewNote, setPreviewNote] = useState(false);
    const [addressFilled, setAddressFilled] = useState(false);
    const company = type === 'company';
    const selection = { fleet_plan: plan === NO_FLEET ? null : plan, apps };
    const hasSelection = selection.fleet_plan !== null || apps.length > 0;
    const appsKey = apps.join(',');
    // Le app si comprano a parte solo se il listino le offre (non nella prima fase dei pagamenti)
    const sellsApps = catalog.apps.length > 0;
    const needSelection = sellsApps ? messages.subscribeNeedSelection : messages.subscribeNeedPlan;
    const canSuggest = !!onSuggestAddress && !!onAddressDetails && catalog.address_autocomplete !== false;
    const vatFactor = 1 + catalog.vat_rate_pct / 100;
    // Il prezzo lo calcola hub a ogni cambio di scelta; una risposta tardiva di una scelta vecchia si scarta
    useEffect(() => {
        if (!hasSelection) {
            setQuote(null);
            return undefined;
        }
        let current = true;
        onQuote({ fleet_plan: plan === NO_FLEET ? null : plan, apps: appsKey ? appsKey.split(',') : [] })
            .then((result) => { if (current)
            setQuote(result); })
            .catch(() => { if (current)
            setQuote(null); });
        return () => { current = false; };
        // onQuote è stabile per chi monta il componente; la scelta è rappresentata da plan e appsKey
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan, appsKey, hasSelection]);
    // ── Prezzi di vetrina: IVA esclusa alle aziende, IVA inclusa ai privati (art. 49 Codice del Consumo) ──
    const factor = company ? 1 : vatFactor;
    const basisLabel = company ? messages.ckVatExcluded : messages.ckVatIncludedBasis;
    const selectedPlan = catalog.plans.find((p) => p.code === plan);
    // Importi del riepilogo: quelli di hub se arrivati, altrimenti quelli di vetrina del piano
    const summary = useMemo(() => {
        if (quote) {
            return { monthly: quote.monthly_cents, net: quote.net_cents, vat: quote.vat_cents, total: quote.total_cents,
                rate: quote.vat_rate_pct, currency: quote.currency };
        }
        if (!selectedPlan)
            return null;
        const net = selectedPlan.monthly_cents * catalog.months;
        const vat = Math.round((net * catalog.vat_rate_pct) / 100);
        return { monthly: selectedPlan.monthly_cents, net, vat, total: net + vat, rate: catalog.vat_rate_pct,
            currency: catalog.currency };
    }, [quote, selectedPlan, catalog]);
    // ── Validazione ──
    const rules = (name) => {
        const nameCheck = (v) => (cleanText(v).length < 2 ? messages.ckErrName : '');
        switch (name) {
            case 'companyName': return { show: company, required: true, check: nameCheck };
            case 'firstName': return { show: !company, required: true, check: nameCheck };
            case 'lastName': return { show: !company, required: true, check: nameCheck };
            case 'vat': return { show: company, required: true, check: (v) => (isValidVat(v) ? '' : messages.ckErrVat) };
            case 'taxCode': return {
                show: true, required: !company,
                check: (v) => {
                    if (company)
                        return isValidTaxCode(v) ? '' : messages.ckErrTaxCode;
                    // Il consumatore ha il codice fiscale personale: quello a 11 cifre è di una società
                    return isValidPersonTaxCode(v) ? '' : messages.ckErrTaxCodePrivate;
                },
            };
            case 'address': return { show: true, required: true, check: (v) => (cleanText(v).length < 3 ? messages.ckErrAddress : '') };
            case 'zip': return { show: true, required: true, check: (v) => (isValidZip(v) ? '' : messages.ckErrZip) };
            case 'city': return { show: true, required: true, check: (v) => (cleanText(v).length < 2 ? messages.ckErrCity : '') };
            case 'province': return { show: true, required: true, check: (v) => (isValidProvince(v) ? '' : messages.ckErrProvince) };
            case 'sdi': return { show: company, required: false, check: (v) => (isValidSdi(v) ? '' : messages.ckErrSdi) };
            case 'pec': return { show: company, required: false, check: (v) => (isValidEmail(v) ? '' : messages.ckErrPec) };
            default: return { show: false, required: false, check: () => '' };
        }
    };
    /** Errore locale di un campo ('' se valido, facoltativo e vuoto, o non visibile) */
    const localError = (name) => {
        const rule = rules(name);
        if (!rule.show)
            return '';
        if (!cleanText(values[name]))
            return rule.required ? messages.ckErrRequired : '';
        return rule.check(values[name]);
    };
    const fieldError = (name) => {
        if (!touched[name] && !submitted)
            return '';
        return localError(name) || serverErrors[name] || '';
    };
    const fieldOk = (name) => !!touched[name] && !fieldError(name) && !!cleanText(values[name]);
    const consentNames = company ? ['terms', 'business'] : ['terms', 'immediate'];
    const consentMessage = {
        terms: messages.ckErrTerms, business: messages.ckErrBusiness, immediate: messages.ckErrImmediate,
    };
    const consentError = (name) => {
        if (!submitted && !serverErrors[name])
            return '';
        if (!consents[name])
            return consentMessage[name];
        return serverErrors[name] ?? '';
    };
    const visibleFields = Object.keys(EMPTY).filter((n) => rules(n).show);
    const fieldLabel = {
        companyName: messages.ckCompanyName, firstName: messages.ckFirstName, lastName: messages.ckLastName,
        vat: messages.ckVat, taxCode: messages.ckTaxCode, address: messages.ckAddress, zip: messages.ckZip,
        city: messages.ckCity, province: messages.ckProvince, sdi: messages.sdiCodeLabel,
        pec: messages.pecLabel,
    };
    const setValue = (name, raw) => {
        let v = raw;
        if (name === 'vat' || name === 'taxCode' || name === 'sdi')
            v = raw.toUpperCase();
        if (name === 'zip')
            v = raw.replace(/\D/g, '').slice(0, 5);
        setValues((prev) => ({ ...prev, [name]: v }));
        // Chi corregge un campo toglie l'errore del server su quel campo
        setServerErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    };
    const blur = (name) => {
        if (!cleanText(values[name]) && !touched[name])
            return; // non rimproverare chi attraversa il campo
        setTouched((prev) => ({ ...prev, [name]: true }));
    };
    const pickAddress = (d) => {
        setValues((prev) => ({
            ...prev,
            address: d.address || prev.address, zip: d.zip || prev.zip, city: d.city || prev.city,
            province: isValidProvince(d.province) ? d.province.toUpperCase() : prev.province,
        }));
        setTouched((prev) => ({ ...prev, address: true, zip: true, city: true, province: true }));
        setAddressFilled(true);
    };
    const sdiNote = company && !cleanText(values.sdi) && !cleanText(values.pec);
    const toggleApp = (key) => {
        setApps((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    };
    const focusField = (id) => {
        const el = rootRef.current?.querySelector(`#${id}`);
        if (el) {
            el.focus({ preventScroll: true });
            el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }
    };
    // Elenco degli errori mostrato sopra il form dopo un clic sul pulsante
    const problems = () => {
        const list = visibleFields
            .map((n) => ({ id: `hub-auth-ck-${n}`, label: fieldLabel[n] ?? n, message: localError(n) || serverErrors[n] || '' }))
            .filter((p) => p.message);
        const consent = consentNames
            .filter((n) => !consents[n] || serverErrors[n])
            .map((n) => ({ id: `hub-auth-ck-c-${n}`, label: messages.ckConsentLabel, message: consentError(n) || consentMessage[n] }));
        return [...list, ...consent];
    };
    const currentProblems = submitted ? problems() : [];
    const buildOrder = () => {
        const v = (n) => cleanText(values[n]);
        return {
            ...selection,
            billing_type: type,
            billing_name: company ? v('companyName') : `${v('firstName')} ${v('lastName')}`.trim(),
            ...(company ? { vat_number: normalizeVat(values.vat) } : {}),
            ...(v('taxCode') ? { tax_code: normalizeTaxCode(values.taxCode) } : {}),
            ...(company && v('sdi') ? { sdi_code: v('sdi').toUpperCase() } : {}),
            ...(company && v('pec') ? { pec_email: v('pec').toLowerCase() } : {}),
            billing_address: v('address'),
            billing_zip: v('zip'),
            billing_city: v('city'),
            billing_province: v('province').toUpperCase(),
            billing_country: 'IT',
            terms_accepted: consents.terms,
            ...(company ? { business_declaration: consents.business } : { immediate_start_requested: consents.immediate }),
        };
    };
    const handleSubmit = async (event) => {
        event?.preventDefault();
        setError('');
        setPreviewNote(false);
        setSubmitted(true);
        if (busy)
            return;
        if (!hasSelection) {
            setError(needSelection);
            return;
        }
        // Errori di questo istante (lo stato `submitted` vale dal render successivo)
        const bad = visibleFields.filter((n) => localError(n));
        const badConsents = consentNames.filter((n) => !consents[n]);
        if (bad.length || badConsents.length) {
            const first = bad[0] ? `hub-auth-ck-${bad[0]}` : `hub-auth-ck-c-${badConsents[0]}`;
            setTimeout(() => focusField(first), 0);
            return;
        }
        if (preview || !onSubmit) {
            setPreviewNote(true);
            return;
        }
        try {
            await onSubmit(buildOrder());
        }
        catch (err) {
            if (err instanceof HubAuthError && err.fieldErrors.length > 0) {
                // Errori di campo del server: sotto il campo giusto, con il primo a fuoco
                const mapped = {};
                for (const fe of err.fieldErrors) {
                    const target = SERVER_FIELD[fe.field];
                    if (target && !mapped[target])
                        mapped[target] = fe.message;
                }
                setServerErrors(mapped);
                const firstField = Object.keys(mapped)[0];
                if (firstField) {
                    const isConsent = firstField === 'terms' || firstField === 'business' || firstField === 'immediate';
                    setTimeout(() => focusField(isConsent ? `hub-auth-ck-c-${firstField}` : `hub-auth-ck-${firstField}`), 0);
                    return;
                }
            }
            setError(errorMessage(err, messages, 'subscribe'));
        }
    };
    // ── Disegno dei campi ──
    const renderField = (name, input, opts = {}) => {
        const rule = rules(name);
        if (!rule.show)
            return null;
        const err = fieldError(name);
        const ok = fieldOk(name);
        const okText = { vat: messages.ckOkVat, taxCode: messages.ckOkTaxCode, sdi: messages.ckOkSdi, pec: messages.ckOkPec }[name] ?? '';
        return (_jsxs("div", { className: `hub-auth__ck-field${err ? ' hub-auth__ck-field--error' : ''}${ok ? ' hub-auth__ck-field--ok' : ''} ${opts.className ?? ''}`.trim(), children: [_jsxs("label", { htmlFor: `hub-auth-ck-${name}`, children: [fieldLabel[name], rule.required
                            ? _jsx("span", { className: "hub-auth__ck-req", "aria-hidden": "true", children: " *" })
                            : _jsxs("span", { className: "hub-auth__ck-opt", children: [" ", messages.ckOptional] })] }), input, opts.hint && !err && _jsx("p", { className: "hub-auth__ck-hint", children: opts.hint }), _jsx("p", { className: "hub-auth__ck-msg", id: `hub-auth-ck-m-${name}`, children: err || (ok ? okText : '') })] }));
    };
    const textInput = (name, extra = {}) => (_jsx("input", { id: `hub-auth-ck-${name}`, className: "hub-auth__ck-input", type: "text", value: values[name], "aria-invalid": fieldError(name) ? true : undefined, "aria-describedby": `hub-auth-ck-m-${name}`, onChange: (e) => setValue(name, e.target.value), onBlur: () => blur(name), ...extra }));
    const renderPlans = () => (_jsx("div", { className: "hub-auth__ck-plans", role: "radiogroup", "aria-label": messages.subscribePlans, children: catalog.plans.map((p, index) => {
            const featured = catalog.plans.length === 3 && index === 1;
            const selected = plan === p.code;
            const list = Math.round(p.list_monthly_cents * factor);
            const monthly = Math.round(p.monthly_cents * factor);
            const year = Math.round(p.monthly_cents * catalog.months * factor);
            return (_jsxs("label", { className: `hub-auth__ck-plan${selected ? ' hub-auth__ck-plan--selected' : ''}${featured ? ' hub-auth__ck-plan--featured' : ''}`, children: [_jsx("input", { type: "radio", name: "hub-auth-plan", value: p.code, checked: selected, disabled: busy, onChange: () => setPlan(p.code) }), featured && _jsx("span", { className: "hub-auth__ck-badge", children: messages.ckRecommended }), _jsx("span", { className: "hub-auth__ck-check", "aria-hidden": "true", children: "\u2713" }), _jsx("span", { className: "hub-auth__ck-plan-name", children: p.label }), p.sites_max != null && (_jsx("span", { className: "hub-auth__ck-plan-sites", children: format(messages.subscribeSites, { sites: p.sites_max }) })), p.description && _jsx("span", { className: "hub-auth__ck-plan-desc", children: p.description }), _jsxs("span", { className: "hub-auth__ck-plan-price", children: [catalog.price_basis === 'launch' && p.list_monthly_cents > p.monthly_cents && (_jsx("s", { children: money(list, catalog.currency) })), _jsx("b", { children: money(monthly, catalog.currency) }), _jsx("i", { children: format(messages.subscribePerMonth, { price: '' }).trim() })] }), _jsxs("span", { className: "hub-auth__ck-plan-year", children: [format(messages.subscribePerYearPrice, { price: money(year, catalog.currency) }), ", ", basisLabel] })] }, p.code));
        }) }));
    const termsNode = withNodes(messages.ckConsentTerms, {
        terms: legalLink(legal?.terms_url, messages.ckTermsLink),
        privacy: legalLink(legal?.privacy_url, messages.ckPrivacyLink),
    });
    const consentBox = (name, label) => {
        const err = consentError(name);
        return (_jsxs("label", { className: `hub-auth__ck-consent${err ? ' hub-auth__ck-consent--error' : ''}`, children: [_jsx("input", { id: `hub-auth-ck-c-${name}`, type: "checkbox", checked: consents[name], disabled: busy, "aria-invalid": err ? true : undefined, "aria-describedby": `hub-auth-ck-cm-${name}`, onChange: (e) => {
                        setConsents((prev) => ({ ...prev, [name]: e.target.checked }));
                        setServerErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
                    } }), _jsx("span", { children: label }), _jsx("span", { className: "hub-auth__ck-msg", id: `hub-auth-ck-cm-${name}`, children: err })] }));
    };
    const withdrawNode = legalLink(legal?.withdrawal_url, messages.ckWithdrawLink);
    const faq = [
        [messages.ckFaq1Q, messages.ckFaq1A],
        [messages.ckFaq2Q, format(messages.ckFaq2A, { days: withdrawalDays })],
        [messages.ckFaq3Q, messages.ckFaq3A],
        [messages.ckFaq4Q, messages.ckFaq4A],
        [messages.ckFaq5Q, messages.ckFaq5A],
        [messages.ckFaq6Q, messages.ckFaq6A],
    ];
    return (_jsxs("div", { className: "hub-auth__ck", ref: rootRef, children: [landing && (_jsxs("header", { className: "hub-auth__ck-hero", children: [_jsx("span", { className: "hub-auth__ck-kicker", children: messages.ckKicker }), _jsxs("h2", { children: [messages.ckHeroTitle, " ", _jsx("span", { className: "hub-auth__ck-grad", children: messages.ckHeroTitleAccent })] }), _jsx("p", { className: "hub-auth__ck-lead", children: messages.ckHeroLead }), _jsxs("div", { className: "hub-auth__ck-trust", children: [_jsx("span", { children: messages.ckTrust1 }), _jsx("span", { children: messages.ckTrust2 }), _jsx("span", { children: messages.ckTrust3 })] })] })), landing && (_jsx("section", { className: "hub-auth__ck-benefits", "aria-label": messages.ckPlansKicker, children: [
                    [messages.ckBenefit1Title, messages.ckBenefit1Text],
                    [messages.ckBenefit2Title, messages.ckBenefit2Text],
                    [messages.ckBenefit3Title, messages.ckBenefit3Text],
                ].map(([title, text]) => (_jsxs("article", { className: "hub-auth__ck-card", children: [_jsx("h3", { children: title }), _jsx("p", { children: text })] }, title))) })), _jsxs("section", { className: "hub-auth__ck-section", id: "hub-auth-ck-plans", children: [_jsxs("div", { className: "hub-auth__ck-head", children: [_jsx("span", { className: "hub-auth__ck-kicker", children: messages.ckPlansKicker }), _jsx("h2", { children: messages.ckPlansTitle }), _jsx("p", { children: company ? messages.ckPlansNoteCompany : messages.ckPlansNotePrivate })] }), renderPlans(), sellsApps && (_jsxs("div", { className: "hub-auth__ck-apps", children: [_jsxs("label", { className: "hub-auth__ck-consent", children: [_jsx("input", { type: "radio", name: "hub-auth-plan", value: NO_FLEET, checked: plan === NO_FLEET, disabled: busy, onChange: () => setPlan(NO_FLEET) }), _jsx("span", { children: messages.subscribeNoFleet })] }), _jsxs("fieldset", { disabled: busy, children: [_jsx("legend", { children: messages.subscribeApps }), catalog.apps.map((a) => (_jsxs("label", { className: "hub-auth__ck-consent", children: [_jsx("input", { type: "checkbox", checked: apps.includes(a.key), onChange: () => toggleApp(a.key) }), _jsx("span", { children: a.label })] }, a.key)))] })] }))] }), _jsxs("section", { className: "hub-auth__ck-section", children: [_jsxs("div", { className: "hub-auth__ck-head", children: [_jsx("span", { className: "hub-auth__ck-kicker", children: messages.ckOrderKicker }), _jsx("h2", { children: messages.ckOrderTitle }), _jsx("p", { children: messages.ckOrderLead })] }), _jsxs("div", { className: "hub-auth__ck-checkout", children: [_jsxs("form", { className: "hub-auth__ck-form", onSubmit: handleSubmit, noValidate: true, children: [currentProblems.length > 0 && (_jsxs("div", { className: "hub-auth__ck-alert hub-auth__ck-alert--error", role: "alert", children: [_jsx("strong", { children: currentProblems.length === 1
                                                    ? messages.ckErrorsOne : format(messages.ckErrorsMany, { count: currentProblems.length }) }), _jsx("ul", { children: currentProblems.map((p) => (_jsxs("li", { children: [_jsx("a", { href: `#${p.id}`, onClick: (e) => { e.preventDefault(); focusField(p.id); }, children: p.label }), ": ", p.message] }, p.id))) })] })), _jsxs("fieldset", { className: "hub-auth__ck-card hub-auth__ck-fieldset", disabled: busy, children: [_jsx("legend", { children: _jsx("span", { className: "hub-auth__ck-title", children: messages.ckWhoTitle }) }), _jsx("p", { className: "hub-auth__ck-sub", children: messages.ckWhoSub }), _jsx("div", { className: "hub-auth__ck-seg", role: "radiogroup", "aria-label": messages.ckWhoTitle, children: [['company', messages.ckCompany, messages.ckCompanySub], ['private', messages.ckPrivate, messages.ckPrivateSub]].map(([value, label, sub]) => (_jsxs("label", { children: [_jsx("input", { type: "radio", name: "hub-auth-ck-type", value: value, checked: type === value, onChange: () => { setType(value); setServerErrors({}); } }), label, _jsx("small", { children: sub })] }, value))) })] }), _jsxs("fieldset", { className: "hub-auth__ck-card hub-auth__ck-fieldset", disabled: busy, children: [_jsx("legend", { children: _jsx("span", { className: "hub-auth__ck-title", children: messages.ckDataTitle }) }), _jsx("p", { className: "hub-auth__ck-sub", children: messages.ckDataSub }), _jsxs("div", { className: "hub-auth__ck-fields", children: [renderField('companyName', textInput('companyName', { autoComplete: 'organization' }), { className: 'hub-auth__ck-span2' }), renderField('firstName', textInput('firstName', { autoComplete: 'given-name' })), renderField('lastName', textInput('lastName', { autoComplete: 'family-name' })), renderField('vat', textInput('vat', { inputMode: 'numeric', maxLength: 14, autoComplete: 'off', placeholder: 'IT12345678903' }), { hint: messages.ckVatHint }), renderField('taxCode', textInput('taxCode', { maxLength: 16, autoComplete: 'off', placeholder: 'RSSMRA85T10A562S' }))] })] }), _jsxs("fieldset", { className: "hub-auth__ck-card hub-auth__ck-fieldset", disabled: busy, children: [_jsx("legend", { children: _jsx("span", { className: "hub-auth__ck-title", children: messages.ckAddressTitle }) }), _jsx("p", { className: "hub-auth__ck-sub", children: canSuggest ? messages.ckAddressSub : messages.ckAddressSubManual }), _jsxs("div", { className: "hub-auth__ck-fields hub-auth__ck-fields--address", children: [renderField('address', onSuggestAddress && onAddressDetails && canSuggest
                                                        ? (_jsx(AddressAutocomplete, { id: "hub-auth-ck-address", value: values.address, onChange: (v) => setValue('address', v), onBlur: () => blur('address'), onPick: pickAddress, suggest: onSuggestAddress, details: onAddressDetails, messages: messages, placeholder: messages.ckAddressPlaceholder, invalid: !!fieldError('address'), describedBy: "hub-auth-ck-m-address" }))
                                                        : textInput('address', { autoComplete: 'street-address', placeholder: messages.ckAddressPlaceholder }), { className: 'hub-auth__ck-span4' }), addressFilled && !fieldError('address') && _jsx("p", { className: "hub-auth__ck-hint hub-auth__ck-span4", role: "status", children: messages.ckAddressFilled }), renderField('zip', textInput('zip', { inputMode: 'numeric', maxLength: 5, autoComplete: 'postal-code', placeholder: '00100' })), renderField('city', textInput('city', { autoComplete: 'address-level2' }), { className: 'hub-auth__ck-span2' }), renderField('province', (_jsxs("select", { id: "hub-auth-ck-province", className: "hub-auth__ck-input", value: values.province, "aria-invalid": fieldError('province') ? true : undefined, "aria-describedby": "hub-auth-ck-m-province", autoComplete: "address-level1", onChange: (e) => { setValue('province', e.target.value); setTouched((p) => ({ ...p, province: true })); }, children: [_jsx("option", { value: "", children: messages.ckProvincePlaceholder }), PROVINCES.map((s) => _jsx("option", { value: s, children: s }, s))] })))] })] }), company && (_jsxs("fieldset", { className: "hub-auth__ck-card hub-auth__ck-fieldset", disabled: busy, children: [_jsx("legend", { children: _jsx("span", { className: "hub-auth__ck-title", children: messages.ckInvoiceTitle }) }), _jsx("p", { className: "hub-auth__ck-sub", children: messages.ckInvoiceSub }), _jsxs("div", { className: "hub-auth__ck-fields", children: [renderField('sdi', textInput('sdi', { maxLength: 7, autoComplete: 'off', placeholder: '7 caratteri' })), renderField('pec', _jsx("input", { id: "hub-auth-ck-pec", className: "hub-auth__ck-input", type: "email", autoComplete: "off", placeholder: "azienda@pec.it", value: values.pec, "aria-invalid": fieldError('pec') ? true : undefined, "aria-describedby": "hub-auth-ck-m-pec", onChange: (e) => setValue('pec', e.target.value), onBlur: () => blur('pec') }))] }), sdiNote && _jsx("p", { className: "hub-auth__ck-alert hub-auth__ck-alert--info", children: messages.ckSdiNote })] })), _jsxs("fieldset", { className: "hub-auth__ck-card hub-auth__ck-fieldset", disabled: busy, children: [_jsx("legend", { children: _jsx("span", { className: "hub-auth__ck-title", children: messages.ckConfirmTitle }) }), _jsx("p", { className: "hub-auth__ck-sub", children: messages.ckConfirmSub }), _jsxs("div", { className: "hub-auth__ck-consents", children: [consentBox('terms', termsNode), company
                                                        ? consentBox('business', messages.ckConsentBusiness)
                                                        : consentBox('immediate', format(messages.ckConsentImmediate, { days: withdrawalDays })), _jsx("p", { className: "hub-auth__ck-legal-note", children: company
                                                            ? messages.ckNoteCompany
                                                            : withNodes(format(messages.ckNotePrivate, { days: withdrawalDays }), { withdraw: withdrawNode }) })] })] })] }), _jsxs("aside", { className: "hub-auth__ck-summary", "aria-live": "polite", children: [_jsx("h3", { children: messages.subscribeSummary }), summary ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "hub-auth__ck-sum-plan", children: [_jsx("strong", { children: selectedPlan?.label ?? messages.subscribeNoFleet }), selectedPlan?.sites_max != null && (_jsx("span", { children: format(messages.subscribeSites, { sites: selectedPlan.sites_max }) }))] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: messages.ckSummaryPlan }), _jsx("dd", { children: format(messages.subscribePerMonth, { price: money(Math.round(summary.monthly * factor), summary.currency) }) })] }), company && _jsxs("div", { children: [_jsx("dt", { children: messages.ckNetAnnual }), _jsx("dd", { children: money(summary.net, summary.currency) })] }), company && _jsxs("div", { children: [_jsx("dt", { children: format(messages.subscribeVat, { rate: summary.rate }) }), _jsx("dd", { children: money(summary.vat, summary.currency) })] }), !company && _jsxs("div", { children: [_jsx("dt", { children: format(messages.ckVatIncluded, { rate: summary.rate }) }), _jsx("dd", { children: money(summary.vat, summary.currency) })] }), _jsxs("div", { className: "hub-auth__ck-total", children: [_jsx("dt", { children: messages.ckTotalAnnual }), _jsx("dd", { children: money(summary.total, summary.currency) })] })] })] })) : (_jsx("p", { className: "hub-auth__ck-sub", children: needSelection })), _jsx("p", { className: "hub-auth__ck-note", children: messages.ckTotalNote }), catalog.price_basis === 'launch' && catalog.launch_until && (_jsx("p", { className: "hub-auth__ck-note", children: format(messages.subscribeLaunch, { date: italianDate(catalog.launch_until) }) })), (catalog.apps_included_months ?? 0) > 0 && (_jsx("p", { className: "hub-auth__ck-perk", children: format(messages.subscribeAppsIncluded, { period: monthsLabel(catalog.apps_included_months ?? 0) }) })), error && _jsx("p", { className: "hub-auth__ck-alert hub-auth__ck-alert--error", role: "alert", children: error }), previewNote && _jsx("p", { className: "hub-auth__ck-alert hub-auth__ck-alert--info", role: "status", children: messages.subscribePreview }), _jsx("button", { type: "button", className: "hub-auth__ck-button", disabled: busy, onClick: () => { void handleSubmit(); }, children: busy ? messages.subscribePaying : messages.ckOrder }), _jsx("p", { className: "hub-auth__ck-after", children: messages.ckAfterOrder }), _jsx("p", { className: "hub-auth__ck-secure", children: messages.ckSecure })] })] })] }), landing && (_jsxs("section", { className: "hub-auth__ck-section", id: "hub-auth-ck-faq", children: [_jsxs("div", { className: "hub-auth__ck-head", children: [_jsx("span", { className: "hub-auth__ck-kicker", children: messages.ckFaqKicker }), _jsx("h2", { children: messages.ckFaqTitle })] }), _jsx("div", { className: "hub-auth__ck-faq", children: faq.map(([q, a]) => (_jsxs("details", { children: [_jsx("summary", { children: q }), _jsx("p", { children: a })] }, q))) })] })), (legal?.seller_info || legal?.terms_url || legal?.privacy_url || legal?.withdrawal_url) && (_jsxs("footer", { className: "hub-auth__ck-foot", children: [legal?.seller_info && _jsx("address", { children: legal.seller_info }), _jsxs("nav", { "aria-label": messages.ckFooterLegal, children: [legal?.terms_url && legalLink(legal.terms_url, messages.ckTermsLink), legal?.privacy_url && legalLink(legal.privacy_url, messages.ckPrivacyLink), legal?.withdrawal_url && legalLink(legal.withdrawal_url, messages.ckWithdrawLink)] })] }))] }));
}
