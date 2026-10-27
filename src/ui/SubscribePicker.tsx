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

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type {
  AddressDetails, AddressSuggestion, BillingCatalog, BillingOrder, BillingQuote, BillingSelection,
  BillingType,
} from '../core/index.js';
import {
  PROVINCES, cleanText, isValidEmail, isValidPersonTaxCode, isValidProvince, isValidSdi,
  isValidTaxCode, isValidVat, isValidZip, normalizeTaxCode, normalizeVat,
} from '../core/fiscal.js';
import { HubAuthError } from '../core/index.js';
import { AddressAutocomplete } from './AddressAutocomplete.js';
import { errorMessage, format, mergeMessages, type HubAuthMessages } from './messages.js';

export interface SubscribePickerProps {
  /** Listino di hub (GET /billing/catalog) */
  catalog: BillingCatalog;
  /** Prezzo di una scelta (POST /billing/quote); un errore lascia il riepilogo con gli importi di vetrina */
  onQuote: (selection: BillingSelection) => Promise<BillingQuote>;
  /** Invio dell'ordine; senza, il pulsante controlla i dati e mostra l'avviso di anteprima */
  onSubmit?: (order: BillingOrder) => Promise<void>;
  /** Suggerimenti di indirizzo (client.suggestAddress); senza, l'indirizzo si scrive a mano */
  onSuggestAddress?: (query: string, session: string) => Promise<AddressSuggestion[]>;
  onAddressDetails?: (placeId: string, session: string) => Promise<AddressDetails | null>;
  /** Anteprima: i dati si controllano ma l'ordine non parte, e lo dice un avviso */
  preview?: boolean;
  /** Pagamento in corso (blocca il form) */
  busy?: boolean;
  /** false: solo scelta e dati, senza presentazione e domande frequenti (default true) */
  landing?: boolean;
  messages?: Partial<HubAuthMessages>;
}

/** Valore del radio "solo app" */
const NO_FLEET = '__none__';

type FieldName = 'companyName' | 'firstName' | 'lastName' | 'vat' | 'taxCode' | 'address' | 'zip'
  | 'city' | 'province' | 'sdi' | 'pec';
type ConsentName = 'terms' | 'business' | 'immediate';
type Values = Record<FieldName, string>;

const EMPTY: Values = {
  companyName: '', firstName: '', lastName: '', vat: '', taxCode: '', address: '', zip: '',
  city: '', province: '', sdi: '', pec: '',
};

/** Campi dell'ordine di hub (loc di un errore 400) -> campi del modulo */
const SERVER_FIELD: Record<string, FieldName | ConsentName> = {
  billing_name: 'companyName', vat_number: 'vat', tax_code: 'taxCode', sdi_code: 'sdi', pec_email: 'pec',
  billing_address: 'address', billing_zip: 'zip', billing_city: 'city', billing_province: 'province',
  terms_accepted: 'terms', business_declaration: 'business', immediate_start_requested: 'immediate',
};

/** Importo in centesimi nel formato della valuta (es. "288,00 €") */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(cents / 100);
}

/** Data ISO (YYYY-MM-DD) in formato italiano, senza spostamenti di fuso */
function italianDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** "1 mese" / "3 mesi" */
function monthsLabel(months: number): string {
  return months === 1 ? '1 mese' : `${months} mesi`;
}

/** Sostituisce {nome} con un nodo (es. un link) dentro un testo dei messaggi */
function withNodes(template: string, nodes: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
  });
}

/** Link che si apre in una scheda nuova; senza indirizzo resta testo semplice */
function legalLink(href: string | null | undefined, label: string): ReactNode {
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
    : <span>{label}</span>;
}

export function SubscribePicker({
  catalog, onQuote, onSubmit, onSuggestAddress, onAddressDetails, preview = false, busy = false,
  landing = true, messages: custom,
}: SubscribePickerProps) {
  const messages = mergeMessages(custom);
  const legal = catalog.legal;
  const withdrawalDays = legal?.withdrawal_days ?? 14;
  const rootRef = useRef<HTMLDivElement>(null);

  // Si parte dal piano in evidenza (il secondo se ce ne sono tre) o dal primo
  const [plan, setPlan] = useState<string>(
    (catalog.plans.length === 3 ? catalog.plans[1] : catalog.plans[0])?.code ?? NO_FLEET);
  const [apps, setApps] = useState<string[]>([]);
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [type, setType] = useState<BillingType>('company');
  const [values, setValues] = useState<Values>(EMPTY);
  const [consents, setConsents] = useState<Record<ConsentName, boolean>>({ terms: false, business: false, immediate: false });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldName | ConsentName, string>>>({});
  const [error, setError] = useState('');
  const [previewNote, setPreviewNote] = useState(false);
  const [addressFilled, setAddressFilled] = useState(false);

  const company = type === 'company';
  const selection: BillingSelection = { fleet_plan: plan === NO_FLEET ? null : plan, apps };
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
      .then((result) => { if (current) setQuote(result); })
      .catch(() => { if (current) setQuote(null); });
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
    if (!selectedPlan) return null;
    const net = selectedPlan.monthly_cents * catalog.months;
    const vat = Math.round((net * catalog.vat_rate_pct) / 100);
    return { monthly: selectedPlan.monthly_cents, net, vat, total: net + vat, rate: catalog.vat_rate_pct,
      currency: catalog.currency };
  }, [quote, selectedPlan, catalog]);

  // ── Validazione ──
  const rules = (name: FieldName): { show: boolean; required: boolean; check: (v: string) => string } => {
    const nameCheck = (v: string) => (cleanText(v).length < 2 ? messages.ckErrName : '');
    switch (name) {
      case 'companyName': return { show: company, required: true, check: nameCheck };
      case 'firstName': return { show: !company, required: true, check: nameCheck };
      case 'lastName': return { show: !company, required: true, check: nameCheck };
      case 'vat': return { show: company, required: true, check: (v) => (isValidVat(v) ? '' : messages.ckErrVat) };
      case 'taxCode': return {
        show: true, required: !company,
        check: (v) => {
          if (company) return isValidTaxCode(v) ? '' : messages.ckErrTaxCode;
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
  const localError = (name: FieldName): string => {
    const rule = rules(name);
    if (!rule.show) return '';
    if (!cleanText(values[name])) return rule.required ? messages.ckErrRequired : '';
    return rule.check(values[name]);
  };

  const fieldError = (name: FieldName): string => {
    if (!touched[name] && !submitted) return '';
    return localError(name) || serverErrors[name] || '';
  };
  const fieldOk = (name: FieldName): boolean => !!touched[name] && !fieldError(name) && !!cleanText(values[name]);

  const consentNames: ConsentName[] = company ? ['terms', 'business'] : ['terms', 'immediate'];
  const consentMessage: Record<ConsentName, string> = {
    terms: messages.ckErrTerms, business: messages.ckErrBusiness, immediate: messages.ckErrImmediate,
  };
  const consentError = (name: ConsentName): string => {
    if (!submitted && !serverErrors[name]) return '';
    if (!consents[name]) return consentMessage[name];
    return serverErrors[name] ?? '';
  };

  const visibleFields = (Object.keys(EMPTY) as FieldName[]).filter((n) => rules(n).show);
  const fieldLabel: Record<FieldName, string> = {
    companyName: messages.ckCompanyName, firstName: messages.ckFirstName, lastName: messages.ckLastName,
    vat: messages.ckVat, taxCode: messages.ckTaxCode, address: messages.ckAddress, zip: messages.ckZip,
    city: messages.ckCity, province: messages.ckProvince, sdi: messages.sdiCodeLabel,
    pec: messages.pecLabel,
  };

  const setValue = (name: FieldName, raw: string) => {
    let v = raw;
    if (name === 'vat' || name === 'taxCode' || name === 'sdi') v = raw.toUpperCase();
    if (name === 'zip') v = raw.replace(/\D/g, '').slice(0, 5);
    setValues((prev) => ({ ...prev, [name]: v }));
    // Chi corregge un campo toglie l'errore del server su quel campo
    setServerErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };
  const blur = (name: FieldName) => {
    if (!cleanText(values[name]) && !touched[name]) return; // non rimproverare chi attraversa il campo
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const pickAddress = (d: AddressDetails) => {
    setValues((prev) => ({
      ...prev,
      address: d.address || prev.address, zip: d.zip || prev.zip, city: d.city || prev.city,
      province: isValidProvince(d.province) ? d.province.toUpperCase() : prev.province,
    }));
    setTouched((prev) => ({ ...prev, address: true, zip: true, city: true, province: true }));
    setAddressFilled(true);
  };

  const sdiNote = company && !cleanText(values.sdi) && !cleanText(values.pec);

  const toggleApp = (key: string) => {
    setApps((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const focusField = (id: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  };

  // Elenco degli errori mostrato sopra il form dopo un clic sul pulsante
  const problems = (): { id: string; label: string; message: string }[] => {
    const list = visibleFields
      .map((n) => ({ id: `hub-auth-ck-${n}`, label: fieldLabel[n] ?? n, message: localError(n) || serverErrors[n] || '' }))
      .filter((p) => p.message);
    const consent = consentNames
      .filter((n) => !consents[n] || serverErrors[n])
      .map((n) => ({ id: `hub-auth-ck-c-${n}`, label: messages.ckConsentLabel, message: consentError(n) || consentMessage[n] }));
    return [...list, ...consent];
  };
  const currentProblems = submitted ? problems() : [];

  const buildOrder = (): BillingOrder => {
    const v = (n: FieldName) => cleanText(values[n]);
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

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError('');
    setPreviewNote(false);
    setSubmitted(true);
    if (busy) return;
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
    } catch (err) {
      if (err instanceof HubAuthError && err.fieldErrors.length > 0) {
        // Errori di campo del server: sotto il campo giusto, con il primo a fuoco
        const mapped: Partial<Record<FieldName | ConsentName, string>> = {};
        for (const fe of err.fieldErrors) {
          const target = SERVER_FIELD[fe.field];
          if (target && !mapped[target]) mapped[target] = fe.message;
        }
        setServerErrors(mapped);
        const firstField = (Object.keys(mapped) as (FieldName | ConsentName)[])[0];
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
  const renderField = (name: FieldName, input: ReactNode, opts: { hint?: string; className?: string } = {}) => {
    const rule = rules(name);
    if (!rule.show) return null;
    const err = fieldError(name);
    const ok = fieldOk(name);
    const okText = ({ vat: messages.ckOkVat, taxCode: messages.ckOkTaxCode, sdi: messages.ckOkSdi, pec: messages.ckOkPec } as
      Partial<Record<FieldName, string>>)[name] ?? '';
    return (
      <div className={`hub-auth__ck-field${err ? ' hub-auth__ck-field--error' : ''}${ok ? ' hub-auth__ck-field--ok' : ''} ${opts.className ?? ''}`.trim()}>
        <label htmlFor={`hub-auth-ck-${name}`}>
          {fieldLabel[name]}
          {rule.required
            ? <span className="hub-auth__ck-req" aria-hidden="true"> *</span>
            : <span className="hub-auth__ck-opt"> {messages.ckOptional}</span>}
        </label>
        {input}
        {opts.hint && !err && <p className="hub-auth__ck-hint">{opts.hint}</p>}
        <p className="hub-auth__ck-msg" id={`hub-auth-ck-m-${name}`}>{err || (ok ? okText : '')}</p>
      </div>
    );
  };

  const textInput = (name: FieldName, extra: Record<string, unknown> = {}) => (
    <input id={`hub-auth-ck-${name}`} className="hub-auth__ck-input" type="text" value={values[name]}
      aria-invalid={fieldError(name) ? true : undefined} aria-describedby={`hub-auth-ck-m-${name}`}
      onChange={(e) => setValue(name, e.target.value)} onBlur={() => blur(name)} {...extra} />
  );

  const renderPlans = () => (
    <div className="hub-auth__ck-plans" role="radiogroup" aria-label={messages.subscribePlans}>
      {catalog.plans.map((p, index) => {
        const featured = catalog.plans.length === 3 && index === 1;
        const selected = plan === p.code;
        const list = Math.round(p.list_monthly_cents * factor);
        const monthly = Math.round(p.monthly_cents * factor);
        const year = Math.round(p.monthly_cents * catalog.months * factor);
        return (
          <label key={p.code}
            className={`hub-auth__ck-plan${selected ? ' hub-auth__ck-plan--selected' : ''}${featured ? ' hub-auth__ck-plan--featured' : ''}`}>
            <input type="radio" name="hub-auth-plan" value={p.code} checked={selected} disabled={busy}
              onChange={() => setPlan(p.code)} />
            {featured && <span className="hub-auth__ck-badge">{messages.ckRecommended}</span>}
            <span className="hub-auth__ck-check" aria-hidden="true">✓</span>
            <span className="hub-auth__ck-plan-name">{p.label}</span>
            {p.sites_max != null && (
              <span className="hub-auth__ck-plan-sites">{format(messages.subscribeSites, { sites: p.sites_max })}</span>
            )}
            {p.description && <span className="hub-auth__ck-plan-desc">{p.description}</span>}
            <span className="hub-auth__ck-plan-price">
              {catalog.price_basis === 'launch' && p.list_monthly_cents > p.monthly_cents && (
                <s>{money(list, catalog.currency)}</s>
              )}
              <b>{money(monthly, catalog.currency)}</b>
              <i>{format(messages.subscribePerMonth, { price: '' }).trim()}</i>
            </span>
            <span className="hub-auth__ck-plan-year">
              {format(messages.subscribePerYearPrice, { price: money(year, catalog.currency) })}, {basisLabel}
            </span>
          </label>
        );
      })}
    </div>
  );

  const termsNode = withNodes(messages.ckConsentTerms, {
    terms: legalLink(legal?.terms_url, messages.ckTermsLink),
    privacy: legalLink(legal?.privacy_url, messages.ckPrivacyLink),
  });

  const consentBox = (name: ConsentName, label: ReactNode) => {
    const err = consentError(name);
    return (
      <label className={`hub-auth__ck-consent${err ? ' hub-auth__ck-consent--error' : ''}`}>
        <input id={`hub-auth-ck-c-${name}`} type="checkbox" checked={consents[name]} disabled={busy}
          aria-invalid={err ? true : undefined} aria-describedby={`hub-auth-ck-cm-${name}`}
          onChange={(e) => {
            setConsents((prev) => ({ ...prev, [name]: e.target.checked }));
            setServerErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
          }} />
        <span>{label}</span>
        <span className="hub-auth__ck-msg" id={`hub-auth-ck-cm-${name}`}>{err}</span>
      </label>
    );
  };

  const withdrawNode = legalLink(legal?.withdrawal_url, messages.ckWithdrawLink);
  const faq: [string, string][] = [
    [messages.ckFaq1Q, messages.ckFaq1A],
    [messages.ckFaq2Q, format(messages.ckFaq2A, { days: withdrawalDays })],
    [messages.ckFaq3Q, messages.ckFaq3A],
    [messages.ckFaq4Q, messages.ckFaq4A],
    [messages.ckFaq5Q, messages.ckFaq5A],
    [messages.ckFaq6Q, messages.ckFaq6A],
  ];

  return (
    <div className="hub-auth__ck" ref={rootRef}>
      {landing && (
        <header className="hub-auth__ck-hero">
          <span className="hub-auth__ck-kicker">{messages.ckKicker}</span>
          <h2>{messages.ckHeroTitle} <span className="hub-auth__ck-grad">{messages.ckHeroTitleAccent}</span></h2>
          <p className="hub-auth__ck-lead">{messages.ckHeroLead}</p>
          <div className="hub-auth__ck-trust">
            <span>{messages.ckTrust1}</span><span>{messages.ckTrust2}</span><span>{messages.ckTrust3}</span>
          </div>
        </header>
      )}

      {landing && (
        <section className="hub-auth__ck-benefits" aria-label={messages.ckPlansKicker}>
          {[
            [messages.ckBenefit1Title, messages.ckBenefit1Text],
            [messages.ckBenefit2Title, messages.ckBenefit2Text],
            [messages.ckBenefit3Title, messages.ckBenefit3Text],
          ].map(([title, text]) => (
            <article key={title} className="hub-auth__ck-card">
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
      )}

      <section className="hub-auth__ck-section" id="hub-auth-ck-plans">
        <div className="hub-auth__ck-head">
          <span className="hub-auth__ck-kicker">{messages.ckPlansKicker}</span>
          <h2>{messages.ckPlansTitle}</h2>
          <p>{company ? messages.ckPlansNoteCompany : messages.ckPlansNotePrivate}</p>
        </div>
        {renderPlans()}
        {sellsApps && (
          <div className="hub-auth__ck-apps">
            <label className="hub-auth__ck-consent">
              <input type="radio" name="hub-auth-plan" value={NO_FLEET} checked={plan === NO_FLEET}
                disabled={busy} onChange={() => setPlan(NO_FLEET)} />
              <span>{messages.subscribeNoFleet}</span>
            </label>
            <fieldset disabled={busy}>
              <legend>{messages.subscribeApps}</legend>
              {catalog.apps.map((a) => (
                <label key={a.key} className="hub-auth__ck-consent">
                  <input type="checkbox" checked={apps.includes(a.key)} onChange={() => toggleApp(a.key)} />
                  <span>{a.label}</span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
      </section>

      <section className="hub-auth__ck-section">
        <div className="hub-auth__ck-head">
          <span className="hub-auth__ck-kicker">{messages.ckOrderKicker}</span>
          <h2>{messages.ckOrderTitle}</h2>
          <p>{messages.ckOrderLead}</p>
        </div>

        <div className="hub-auth__ck-checkout">
          <form className="hub-auth__ck-form" onSubmit={handleSubmit} noValidate>
            {currentProblems.length > 0 && (
              <div className="hub-auth__ck-alert hub-auth__ck-alert--error" role="alert">
                <strong>
                  {currentProblems.length === 1
                    ? messages.ckErrorsOne : format(messages.ckErrorsMany, { count: currentProblems.length })}
                </strong>
                <ul>
                  {currentProblems.map((p) => (
                    <li key={p.id}>
                      <a href={`#${p.id}`} onClick={(e) => { e.preventDefault(); focusField(p.id); }}>{p.label}</a>: {p.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <fieldset className="hub-auth__ck-card hub-auth__ck-fieldset" disabled={busy}>
              <legend><span className="hub-auth__ck-title">{messages.ckWhoTitle}</span></legend>
              <p className="hub-auth__ck-sub">{messages.ckWhoSub}</p>
              <div className="hub-auth__ck-seg" role="radiogroup" aria-label={messages.ckWhoTitle}>
                {([['company', messages.ckCompany, messages.ckCompanySub], ['private', messages.ckPrivate, messages.ckPrivateSub]] as
                  [BillingType, string, string][]).map(([value, label, sub]) => (
                  <label key={value}>
                    <input type="radio" name="hub-auth-ck-type" value={value} checked={type === value}
                      onChange={() => { setType(value); setServerErrors({}); }} />
                    {label}<small>{sub}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="hub-auth__ck-card hub-auth__ck-fieldset" disabled={busy}>
              <legend><span className="hub-auth__ck-title">{messages.ckDataTitle}</span></legend>
              <p className="hub-auth__ck-sub">{messages.ckDataSub}</p>
              <div className="hub-auth__ck-fields">
                {renderField('companyName', textInput('companyName', { autoComplete: 'organization' }), { className: 'hub-auth__ck-span2' })}
                {renderField('firstName', textInput('firstName', { autoComplete: 'given-name' }))}
                {renderField('lastName', textInput('lastName', { autoComplete: 'family-name' }))}
                {renderField('vat', textInput('vat', { inputMode: 'numeric', maxLength: 14, autoComplete: 'off', placeholder: 'IT12345678903' }),
                  { hint: messages.ckVatHint })}
                {renderField('taxCode', textInput('taxCode', { maxLength: 16, autoComplete: 'off', placeholder: 'RSSMRA85T10A562S' }))}
              </div>
            </fieldset>

            <fieldset className="hub-auth__ck-card hub-auth__ck-fieldset" disabled={busy}>
              <legend><span className="hub-auth__ck-title">{messages.ckAddressTitle}</span></legend>
              <p className="hub-auth__ck-sub">{canSuggest ? messages.ckAddressSub : messages.ckAddressSubManual}</p>
              <div className="hub-auth__ck-fields hub-auth__ck-fields--address">
                {renderField('address', onSuggestAddress && onAddressDetails && canSuggest
                  ? (
                    <AddressAutocomplete id="hub-auth-ck-address" value={values.address}
                      onChange={(v) => setValue('address', v)} onBlur={() => blur('address')}
                      onPick={pickAddress} suggest={onSuggestAddress} details={onAddressDetails}
                      messages={messages} placeholder={messages.ckAddressPlaceholder}
                      invalid={!!fieldError('address')} describedBy="hub-auth-ck-m-address" />
                  )
                  : textInput('address', { autoComplete: 'street-address', placeholder: messages.ckAddressPlaceholder }),
                { className: 'hub-auth__ck-span4' })}
                {addressFilled && !fieldError('address') && <p className="hub-auth__ck-hint hub-auth__ck-span4" role="status">{messages.ckAddressFilled}</p>}
                {renderField('zip', textInput('zip', { inputMode: 'numeric', maxLength: 5, autoComplete: 'postal-code', placeholder: '00100' }))}
                {renderField('city', textInput('city', { autoComplete: 'address-level2' }), { className: 'hub-auth__ck-span2' })}
                {renderField('province', (
                  <select id="hub-auth-ck-province" className="hub-auth__ck-input" value={values.province}
                    aria-invalid={fieldError('province') ? true : undefined} aria-describedby="hub-auth-ck-m-province"
                    autoComplete="address-level1"
                    onChange={(e) => { setValue('province', e.target.value); setTouched((p) => ({ ...p, province: true })); }}>
                    <option value="">{messages.ckProvincePlaceholder}</option>
                    {PROVINCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ))}
              </div>
            </fieldset>

            {company && (
              <fieldset className="hub-auth__ck-card hub-auth__ck-fieldset" disabled={busy}>
                <legend><span className="hub-auth__ck-title">{messages.ckInvoiceTitle}</span></legend>
                <p className="hub-auth__ck-sub">{messages.ckInvoiceSub}</p>
                <div className="hub-auth__ck-fields">
                  {renderField('sdi', textInput('sdi', { maxLength: 7, autoComplete: 'off', placeholder: '7 caratteri' }))}
                  {renderField('pec', <input id="hub-auth-ck-pec" className="hub-auth__ck-input" type="email" autoComplete="off"
                    placeholder="azienda@pec.it" value={values.pec} aria-invalid={fieldError('pec') ? true : undefined}
                    aria-describedby="hub-auth-ck-m-pec" onChange={(e) => setValue('pec', e.target.value)} onBlur={() => blur('pec')} />)}
                </div>
                {sdiNote && <p className="hub-auth__ck-alert hub-auth__ck-alert--info">{messages.ckSdiNote}</p>}
              </fieldset>
            )}

            <fieldset className="hub-auth__ck-card hub-auth__ck-fieldset" disabled={busy}>
              <legend><span className="hub-auth__ck-title">{messages.ckConfirmTitle}</span></legend>
              <p className="hub-auth__ck-sub">{messages.ckConfirmSub}</p>
              <div className="hub-auth__ck-consents">
                {consentBox('terms', termsNode)}
                {company
                  ? consentBox('business', messages.ckConsentBusiness)
                  : consentBox('immediate', format(messages.ckConsentImmediate, { days: withdrawalDays }))}
                <p className="hub-auth__ck-legal-note">
                  {company
                    ? messages.ckNoteCompany
                    : withNodes(format(messages.ckNotePrivate, { days: withdrawalDays }), { withdraw: withdrawNode })}
                </p>
              </div>
            </fieldset>
          </form>

          <aside className="hub-auth__ck-summary" aria-live="polite">
            <h3>{messages.subscribeSummary}</h3>
            {summary ? (
              <>
                <div className="hub-auth__ck-sum-plan">
                  <strong>{selectedPlan?.label ?? messages.subscribeNoFleet}</strong>
                  {selectedPlan?.sites_max != null && (
                    <span>{format(messages.subscribeSites, { sites: selectedPlan.sites_max })}</span>
                  )}
                </div>
                <dl>
                  <div><dt>{messages.ckSummaryPlan}</dt>
                    <dd>{format(messages.subscribePerMonth, { price: money(Math.round(summary.monthly * factor), summary.currency) })}</dd></div>
                  {company && <div><dt>{messages.ckNetAnnual}</dt><dd>{money(summary.net, summary.currency)}</dd></div>}
                  {company && <div><dt>{format(messages.subscribeVat, { rate: summary.rate })}</dt><dd>{money(summary.vat, summary.currency)}</dd></div>}
                  {!company && <div><dt>{format(messages.ckVatIncluded, { rate: summary.rate })}</dt><dd>{money(summary.vat, summary.currency)}</dd></div>}
                  <div className="hub-auth__ck-total"><dt>{messages.ckTotalAnnual}</dt><dd>{money(summary.total, summary.currency)}</dd></div>
                </dl>
              </>
            ) : (
              <p className="hub-auth__ck-sub">{needSelection}</p>
            )}
            <p className="hub-auth__ck-note">{messages.ckTotalNote}</p>
            {catalog.price_basis === 'launch' && catalog.launch_until && (
              <p className="hub-auth__ck-note">{format(messages.subscribeLaunch, { date: italianDate(catalog.launch_until) })}</p>
            )}
            {(catalog.apps_included_months ?? 0) > 0 && (
              <p className="hub-auth__ck-perk">
                {format(messages.subscribeAppsIncluded, { period: monthsLabel(catalog.apps_included_months ?? 0) })}
              </p>
            )}
            {error && <p className="hub-auth__ck-alert hub-auth__ck-alert--error" role="alert">{error}</p>}
            {previewNote && <p className="hub-auth__ck-alert hub-auth__ck-alert--info" role="status">{messages.subscribePreview}</p>}
            <button type="button" className="hub-auth__ck-button" disabled={busy} onClick={() => { void handleSubmit(); }}>
              {busy ? messages.subscribePaying : messages.ckOrder}
            </button>
            <p className="hub-auth__ck-after">{messages.ckAfterOrder}</p>
            <p className="hub-auth__ck-secure">{messages.ckSecure}</p>
          </aside>
        </div>
      </section>

      {landing && (
        <section className="hub-auth__ck-section" id="hub-auth-ck-faq">
          <div className="hub-auth__ck-head">
            <span className="hub-auth__ck-kicker">{messages.ckFaqKicker}</span>
            <h2>{messages.ckFaqTitle}</h2>
          </div>
          <div className="hub-auth__ck-faq">
            {faq.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </section>
      )}

      {(legal?.seller_info || legal?.terms_url || legal?.privacy_url || legal?.withdrawal_url) && (
        <footer className="hub-auth__ck-foot">
          {legal?.seller_info && <address>{legal.seller_info}</address>}
          <nav aria-label={messages.ckFooterLegal}>
            {legal?.terms_url && legalLink(legal.terms_url, messages.ckTermsLink)}
            {legal?.privacy_url && legalLink(legal.privacy_url, messages.ckPrivacyLink)}
            {legal?.withdrawal_url && legalLink(legal.withdrawal_url, messages.ckWithdrawLink)}
          </nav>
        </footer>
      )}
    </div>
  );
}
