import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Scelta dell'abbonamento e dati di fatturazione (dalla 1.14.0).
 *
 * Componente di presentazione: non legge il client né il Provider, riceve il listino
 * e due funzioni. Così lo stesso form serve sia a `SubscribeStep` (login, con il client
 * reale) sia all'anteprima della dashboard admin, che lo monta con `preview` e senza
 * `onSubmit` per vedere la pagina di pagamento senza poter comprare nulla.
 *
 * Gli importi non si calcolano qui: ogni cambio di scelta chiede il prezzo a hub
 * (`onQuote`), che lo calcola dal listino salvato nel database. Fanno eccezione i soli
 * importi di vetrina di ogni piano (mensile e annuale, mensile x `months`).
 *
 * Dalla 1.15.0 i piani sono tre colonne con descrizione, listino, mensile e annuale. Le app
 * si scelgono (e c'è l'opzione "solo app") solo se il listino ne offre: con `apps` vuoto, come
 * nella prima fase dei pagamenti, resta la scelta del piano e una riga sulle app incluse.
 */
import { useEffect, useState } from 'react';
import { errorMessage, format, mergeMessages } from './messages.js';
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
/** Valore del radio "solo app" */
const NO_FLEET = '__none__';
export function SubscribePicker({ catalog, onQuote, onSubmit, preview = false, busy = false, messages: custom, }) {
    const messages = mergeMessages(custom);
    // Si parte dal primo piano del listino: è la scelta più comune
    const [plan, setPlan] = useState(catalog.plans[0]?.code ?? NO_FLEET);
    const [apps, setApps] = useState([]);
    const [quote, setQuote] = useState(null);
    const [error, setError] = useState('');
    const [billingName, setBillingName] = useState('');
    const [vatNumber, setVatNumber] = useState('');
    const [taxCode, setTaxCode] = useState('');
    const [sdiCode, setSdiCode] = useState('');
    const [pec, setPec] = useState('');
    const [country, setCountry] = useState('IT');
    const selection = { fleet_plan: plan === NO_FLEET ? null : plan, apps };
    const hasSelection = selection.fleet_plan !== null || apps.length > 0;
    const appsKey = apps.join(',');
    // Le app si comprano a parte solo se il listino le offre (non nella prima fase dei pagamenti)
    const sellsApps = catalog.apps.length > 0;
    const needSelection = sellsApps ? messages.subscribeNeedSelection : messages.subscribeNeedPlan;
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
    const toggleApp = (key) => {
        setApps((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    };
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        if (!onSubmit || preview)
            return;
        if (!hasSelection) {
            setError(needSelection);
            return;
        }
        if (billingName.trim().length < 2 || (!vatNumber.trim() && !taxCode.trim())) {
            setError(messages.fiscalRequired);
            return;
        }
        try {
            await onSubmit({
                ...selection,
                billing_name: billingName.trim(),
                ...(vatNumber.trim() ? { vat_number: vatNumber.trim() } : {}),
                ...(taxCode.trim() ? { tax_code: taxCode.trim() } : {}),
                ...(sdiCode.trim() ? { sdi_code: sdiCode.trim() } : {}),
                ...(pec.trim() ? { pec_email: pec.trim() } : {}),
                billing_country: country.trim() || 'IT',
            });
        }
        catch (err) {
            setError(errorMessage(err, messages, 'subscribe'));
        }
    };
    const disabled = busy;
    return (_jsxs("form", { className: "hub-auth__form hub-auth__subscribe", onSubmit: handleSubmit, noValidate: true, children: [_jsx("h2", { className: "hub-auth__heading", children: messages.subscribeTitle }), _jsx("p", { className: "hub-auth__text", children: messages.subscribeIntro }), _jsxs("fieldset", { className: "hub-auth__fieldset", disabled: disabled, children: [_jsx("legend", { className: "hub-auth__legend", children: messages.subscribePlans }), _jsx("div", { className: "hub-auth__plans", children: catalog.plans.map((p) => (_jsxs("label", { className: `hub-auth__option hub-auth__option--plan${plan === p.code ? ' hub-auth__option--selected' : ''}`, children: [_jsx("input", { type: "radio", name: "hub-auth-plan", value: p.code, checked: plan === p.code, onChange: () => setPlan(p.code) }), _jsxs("span", { className: "hub-auth__option-body", children: [_jsx("span", { className: "hub-auth__option-title", children: p.label }), p.description && _jsx("span", { className: "hub-auth__option-desc", children: p.description }), p.sites_max != null && (_jsx("span", { className: "hub-auth__option-note", children: format(messages.subscribeSites, { sites: p.sites_max }) }))] }), _jsxs("span", { className: "hub-auth__option-price", children: [catalog.price_basis === 'launch' && p.list_monthly_cents > p.monthly_cents && (_jsx("s", { className: "hub-auth__option-list", children: format(messages.subscribeListPrice, { price: money(p.list_monthly_cents, catalog.currency) }) })), _jsx("span", { className: "hub-auth__option-price-main", children: format(messages.subscribePerMonth, { price: money(p.monthly_cents, catalog.currency) }) }), _jsx("span", { className: "hub-auth__option-note", children: format(messages.subscribePerYearPrice, { price: money(p.monthly_cents * catalog.months, catalog.currency) }) })] })] }, p.code))) }), sellsApps && (_jsxs("label", { className: `hub-auth__option${plan === NO_FLEET ? ' hub-auth__option--selected' : ''}`, children: [_jsx("input", { type: "radio", name: "hub-auth-plan", value: NO_FLEET, checked: plan === NO_FLEET, onChange: () => setPlan(NO_FLEET) }), _jsx("span", { className: "hub-auth__option-body", children: _jsx("span", { className: "hub-auth__option-title", children: messages.subscribeNoFleet }) })] }))] }), sellsApps && (_jsxs("fieldset", { className: "hub-auth__fieldset", disabled: disabled, children: [_jsx("legend", { className: "hub-auth__legend", children: messages.subscribeApps }), catalog.apps.map((a) => (_jsxs("label", { className: "hub-auth__check", children: [_jsx("input", { type: "checkbox", checked: apps.includes(a.key), onChange: () => toggleApp(a.key) }), _jsx("span", { children: a.label })] }, a.key)))] })), (catalog.apps_included_months ?? 0) > 0 && (_jsx("p", { className: "hub-auth__note", children: format(messages.subscribeAppsIncluded, { period: monthsLabel(catalog.apps_included_months ?? 0) }) })), catalog.price_basis === 'launch' && catalog.launch_until && (_jsx("p", { className: "hub-auth__note", children: format(messages.subscribeLaunch, { date: italianDate(catalog.launch_until) }) })), _jsxs("div", { className: "hub-auth__summary", "aria-live": "polite", children: [_jsx("h3", { className: "hub-auth__summary-title", children: messages.subscribeSummary }), quote ? (_jsxs("dl", { className: "hub-auth__summary-list", children: [_jsxs("div", { className: "hub-auth__summary-row", children: [_jsx("dt", { children: messages.subscribeNet }), _jsx("dd", { children: money(quote.net_cents, quote.currency) })] }), _jsxs("div", { className: "hub-auth__summary-row", children: [_jsx("dt", { children: format(messages.subscribeVat, { rate: quote.vat_rate_pct }) }), _jsx("dd", { children: money(quote.vat_cents, quote.currency) })] }), _jsxs("div", { className: "hub-auth__summary-row hub-auth__summary-row--total", children: [_jsx("dt", { children: messages.subscribeTotal }), _jsx("dd", { children: money(quote.total_cents, quote.currency) })] })] })) : (_jsx("p", { className: "hub-auth__note", children: needSelection })), _jsx("p", { className: "hub-auth__note", children: messages.subscribePerYear })] }), _jsxs("fieldset", { className: "hub-auth__fieldset", disabled: disabled, children: [_jsx("legend", { className: "hub-auth__legend", children: messages.subscribeBilling }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-billing-name", children: messages.billingNameLabel }), _jsx("input", { id: "hub-auth-billing-name", className: "hub-auth__input", type: "text", autoComplete: "organization", value: billingName, onChange: (e) => setBillingName(e.target.value) }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-vat", children: messages.vatNumberLabel }), _jsx("input", { id: "hub-auth-vat", className: "hub-auth__input", type: "text", autoComplete: "off", value: vatNumber, onChange: (e) => setVatNumber(e.target.value) }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-tax-code", children: messages.taxCodeLabel }), _jsx("input", { id: "hub-auth-tax-code", className: "hub-auth__input", type: "text", autoComplete: "off", value: taxCode, onChange: (e) => setTaxCode(e.target.value) }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-sdi", children: messages.sdiCodeLabel }), _jsx("input", { id: "hub-auth-sdi", className: "hub-auth__input", type: "text", autoComplete: "off", maxLength: 7, value: sdiCode, onChange: (e) => setSdiCode(e.target.value) }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-pec", children: messages.pecLabel }), _jsx("input", { id: "hub-auth-pec", className: "hub-auth__input", type: "email", autoComplete: "off", value: pec, onChange: (e) => setPec(e.target.value) }), _jsx("label", { className: "hub-auth__label", htmlFor: "hub-auth-country", children: messages.countryLabel }), _jsx("input", { id: "hub-auth-country", className: "hub-auth__input", type: "text", maxLength: 2, autoComplete: "country", value: country, onChange: (e) => setCountry(e.target.value) })] }), preview && _jsx("p", { className: "hub-auth__note", role: "note", children: messages.subscribePreview }), error && _jsx("p", { className: "hub-auth__error", role: "alert", children: error }), _jsx("button", { className: "hub-auth__button", type: "submit", disabled: disabled || preview || !onSubmit || !hasSelection || !quote, children: busy ? messages.subscribePaying : messages.subscribePay })] }));
}
