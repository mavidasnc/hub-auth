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

import { useEffect, useState, type FormEvent } from 'react';
import type { BillingCatalog, BillingOrder, BillingQuote, BillingSelection } from '../core/index.js';
import { errorMessage, format, mergeMessages, type HubAuthMessages } from './messages.js';

export interface SubscribePickerProps {
  /** Listino di hub (GET /billing/catalog) */
  catalog: BillingCatalog;
  /** Prezzo di una scelta (POST /billing/quote); un errore lascia il riepilogo vuoto */
  onQuote: (selection: BillingSelection) => Promise<BillingQuote>;
  /** Invio dell'ordine; se manca il pulsante di pagamento resta disattivato */
  onSubmit?: (order: BillingOrder) => Promise<void>;
  /** Anteprima: il pulsante di pagamento è disattivato e lo dice un avviso */
  preview?: boolean;
  /** Pagamento in corso (blocca il form) */
  busy?: boolean;
  messages?: Partial<HubAuthMessages>;
}

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

/** Valore del radio "solo app" */
const NO_FLEET = '__none__';

export function SubscribePicker({
  catalog, onQuote, onSubmit, preview = false, busy = false, messages: custom,
}: SubscribePickerProps) {
  const messages = mergeMessages(custom);
  // Si parte dal primo piano del listino: è la scelta più comune
  const [plan, setPlan] = useState<string>(catalog.plans[0]?.code ?? NO_FLEET);
  const [apps, setApps] = useState<string[]>([]);
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [error, setError] = useState('');
  const [billingName, setBillingName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [sdiCode, setSdiCode] = useState('');
  const [pec, setPec] = useState('');
  const [country, setCountry] = useState('IT');

  const selection: BillingSelection = { fleet_plan: plan === NO_FLEET ? null : plan, apps };
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
      .then((result) => { if (current) setQuote(result); })
      .catch(() => { if (current) setQuote(null); });
    return () => { current = false; };
    // onQuote è stabile per chi monta il componente; la scelta è rappresentata da plan e appsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, appsKey, hasSelection]);

  const toggleApp = (key: string) => {
    setApps((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!onSubmit || preview) return;
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
    } catch (err) {
      setError(errorMessage(err, messages, 'subscribe'));
    }
  };

  const disabled = busy;

  return (
    <form className="hub-auth__form hub-auth__subscribe" onSubmit={handleSubmit} noValidate>
      <h2 className="hub-auth__heading">{messages.subscribeTitle}</h2>
      <p className="hub-auth__text">{messages.subscribeIntro}</p>

      <fieldset className="hub-auth__fieldset" disabled={disabled}>
        <legend className="hub-auth__legend">{messages.subscribePlans}</legend>
        <div className="hub-auth__plans">
          {catalog.plans.map((p) => (
            <label key={p.code}
              className={`hub-auth__option hub-auth__option--plan${plan === p.code ? ' hub-auth__option--selected' : ''}`}>
              <input type="radio" name="hub-auth-plan" value={p.code}
                checked={plan === p.code} onChange={() => setPlan(p.code)} />
              <span className="hub-auth__option-body">
                <span className="hub-auth__option-title">{p.label}</span>
                {p.description && <span className="hub-auth__option-desc">{p.description}</span>}
                {p.sites_max != null && (
                  <span className="hub-auth__option-note">{format(messages.subscribeSites, { sites: p.sites_max })}</span>
                )}
              </span>
              <span className="hub-auth__option-price">
                {catalog.price_basis === 'launch' && p.list_monthly_cents > p.monthly_cents && (
                  <s className="hub-auth__option-list">
                    {format(messages.subscribeListPrice, { price: money(p.list_monthly_cents, catalog.currency) })}
                  </s>
                )}
                <span className="hub-auth__option-price-main">
                  {format(messages.subscribePerMonth, { price: money(p.monthly_cents, catalog.currency) })}
                </span>
                <span className="hub-auth__option-note">
                  {format(messages.subscribePerYearPrice, { price: money(p.monthly_cents * catalog.months, catalog.currency) })}
                </span>
              </span>
            </label>
          ))}
        </div>
        {sellsApps && (
          <label className={`hub-auth__option${plan === NO_FLEET ? ' hub-auth__option--selected' : ''}`}>
            <input type="radio" name="hub-auth-plan" value={NO_FLEET}
              checked={plan === NO_FLEET} onChange={() => setPlan(NO_FLEET)} />
            <span className="hub-auth__option-body">
              <span className="hub-auth__option-title">{messages.subscribeNoFleet}</span>
            </span>
          </label>
        )}
      </fieldset>

      {sellsApps && (
        <fieldset className="hub-auth__fieldset" disabled={disabled}>
          <legend className="hub-auth__legend">{messages.subscribeApps}</legend>
          {catalog.apps.map((a) => (
            <label key={a.key} className="hub-auth__check">
              <input type="checkbox" checked={apps.includes(a.key)} onChange={() => toggleApp(a.key)} />
              <span>{a.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {(catalog.apps_included_months ?? 0) > 0 && (
        <p className="hub-auth__note">
          {format(messages.subscribeAppsIncluded, { period: monthsLabel(catalog.apps_included_months ?? 0) })}
        </p>
      )}

      {catalog.price_basis === 'launch' && catalog.launch_until && (
        <p className="hub-auth__note">{format(messages.subscribeLaunch, { date: italianDate(catalog.launch_until) })}</p>
      )}

      <div className="hub-auth__summary" aria-live="polite">
        <h3 className="hub-auth__summary-title">{messages.subscribeSummary}</h3>
        {quote ? (
          <dl className="hub-auth__summary-list">
            <div className="hub-auth__summary-row">
              <dt>{messages.subscribeNet}</dt>
              <dd>{money(quote.net_cents, quote.currency)}</dd>
            </div>
            <div className="hub-auth__summary-row">
              <dt>{format(messages.subscribeVat, { rate: quote.vat_rate_pct })}</dt>
              <dd>{money(quote.vat_cents, quote.currency)}</dd>
            </div>
            <div className="hub-auth__summary-row hub-auth__summary-row--total">
              <dt>{messages.subscribeTotal}</dt>
              <dd>{money(quote.total_cents, quote.currency)}</dd>
            </div>
          </dl>
        ) : (
          <p className="hub-auth__note">{needSelection}</p>
        )}
        <p className="hub-auth__note">{messages.subscribePerYear}</p>
      </div>

      <fieldset className="hub-auth__fieldset" disabled={disabled}>
        <legend className="hub-auth__legend">{messages.subscribeBilling}</legend>

        <label className="hub-auth__label" htmlFor="hub-auth-billing-name">{messages.billingNameLabel}</label>
        <input id="hub-auth-billing-name" className="hub-auth__input" type="text" autoComplete="organization"
          value={billingName} onChange={(e) => setBillingName(e.target.value)} />

        <label className="hub-auth__label" htmlFor="hub-auth-vat">{messages.vatNumberLabel}</label>
        <input id="hub-auth-vat" className="hub-auth__input" type="text" autoComplete="off"
          value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />

        <label className="hub-auth__label" htmlFor="hub-auth-tax-code">{messages.taxCodeLabel}</label>
        <input id="hub-auth-tax-code" className="hub-auth__input" type="text" autoComplete="off"
          value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />

        <label className="hub-auth__label" htmlFor="hub-auth-sdi">{messages.sdiCodeLabel}</label>
        <input id="hub-auth-sdi" className="hub-auth__input" type="text" autoComplete="off" maxLength={7}
          value={sdiCode} onChange={(e) => setSdiCode(e.target.value)} />

        <label className="hub-auth__label" htmlFor="hub-auth-pec">{messages.pecLabel}</label>
        <input id="hub-auth-pec" className="hub-auth__input" type="email" autoComplete="off"
          value={pec} onChange={(e) => setPec(e.target.value)} />

        <label className="hub-auth__label" htmlFor="hub-auth-country">{messages.countryLabel}</label>
        <input id="hub-auth-country" className="hub-auth__input" type="text" maxLength={2} autoComplete="country"
          value={country} onChange={(e) => setCountry(e.target.value)} />
      </fieldset>

      {preview && <p className="hub-auth__note" role="note">{messages.subscribePreview}</p>}
      {error && <p className="hub-auth__error" role="alert">{error}</p>}

      <button className="hub-auth__button" type="submit"
        disabled={disabled || preview || !onSubmit || !hasSelection || !quote}>
        {busy ? messages.subscribePaying : messages.subscribePay}
      </button>
    </form>
  );
}
