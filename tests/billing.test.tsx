/**
 * Test della 1.14.0: pagamento con PayPal (hub >= 0.267.0). Core del client (403
 * SubscriptionRequired, token di pagamento, ritorno da PayPal) e componenti
 * (SubscribePicker, SubscribeStep dentro LoginScreen).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, HubAuthError, memoryStorageAdapter } from '../src/core/index.js';
import type { BillingCatalog, BillingOrder, BillingQuote } from '../src/core/index.js';
import { HubAuthProvider } from '../src/react/index.js';
import { LoginScreen } from '../src/ui/index.js';

const BASE = 'https://hub.test/v1/';
const KEY = 'billing-test';
const BILLING_KEY = `${KEY}:billing`;

const CATALOG: BillingCatalog = {
  enabled: true,
  currency: 'EUR',
  vat_rate_pct: 22,
  price_basis: 'launch',
  launch_until: '2026-12-31',
  months: 12,
  plans: [
    { code: 'starter', label: 'Starter', monthly_cents: 1200, list_monthly_cents: 1500,
      launch_monthly_cents: 1200, app_discount_pct: 0, sites_max: 10 },
    { code: 'pro', label: 'Pro', monthly_cents: 2400, list_monthly_cents: 3000,
      launch_monthly_cents: 2400, app_discount_pct: 20, sites_max: 25 },
  ],
  apps: [{ key: 'voicenote', label: 'VoiceNote' }, { key: 'wandly', label: 'Wandly' }],
  app_tiers: [{ count: 1, base_monthly_cents: 350 }],
  no_fleet_markup_pct: 120,
};

/** Ordine di un'azienda nel formato di hub >= 0.272.0 */
const ORDER: BillingOrder = {
  fleet_plan: 'pro', apps: [], billing_type: 'company', billing_name: 'Rossi Srl', vat_number: '12345678903',
  billing_address: 'Via Roma 1', billing_zip: '20121', billing_city: 'Milano', billing_province: 'MI',
  billing_country: 'IT', terms_accepted: true, business_declaration: true,
};

const QUOTE: BillingQuote = {
  price_basis: 'launch', fleet_plan: 'starter', apps: [], fleet_monthly_cents: 1200,
  app_monthly_cents: 0, monthly_cents: 1200, net_cents: 14400, vat_cents: 3168,
  total_cents: 17568, vat_rate_pct: 22, currency: 'EUR',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 403 SubscriptionRequired come lo risponde hub, con il token di pagamento */
const subscriptionRequired = (token = 'BILLING_TOKEN') =>
  json(403, { error: 'SubscriptionRequired', message: 'Serve un abbonamento.', details: { tool: 'fleet', billing_token: token } });

type Handler = (init: RequestInit | undefined, path: string) => Response | Promise<Response>;

/** Client con una fetch finta che instrada per percorso (relativo a BASE) */
function creaClient(routes: Record<string, Handler>, extra: Record<string, unknown> = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(BASE, '');
    const handler = routes[path] ?? routes[path.split('?')[0]];
    if (!handler) throw new Error(`rotta non prevista: ${path}`);
    return handler(init, path);
  });
  const redirect = vi.fn();
  const client = createHubAuth({
    baseUrl: BASE, storageKey: KEY, storage: memoryStorageAdapter(), fetch, tool: 'fleet',
    magicLink: false, redirect, ...extra,
  });
  return { client, fetch, redirect };
}

const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

const chiamate = (fetch: ReturnType<typeof creaClient>['fetch'], path: string) =>
  fetch.mock.calls.filter(([input]) => String(input).replace(BASE, '').startsWith(path));

/** Porta il client allo step 'otp' con un codice verificabile */
async function conCodice(client: ReturnType<typeof creaClient>['client']) {
  await client.ready;
  await client.requestOtp('mario@esempio.it');
}

const OTP_OK = { 'otp-request': () => json(200, { success: true }) };

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  window.sessionStorage.clear();
});

describe('403 SubscriptionRequired nel login', () => {
  it('verifyOtp: passa allo step subscribe senza lanciare e senza sessione', async () => {
    const { client } = creaClient({ ...OTP_OK, 'otp-verify': () => subscriptionRequired() });
    await conCodice(client);

    await expect(client.verifyOtp('123456')).resolves.toBeUndefined();

    const state = client.getState();
    expect(state.step).toBe('subscribe');
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('verifyOtp: gli altri errori 403 restano errori', async () => {
    const { client } = creaClient({
      ...OTP_OK,
      'otp-verify': () => json(403, { error: 'ToolNotEnabled', message: 'No' }),
    });
    await conCodice(client);

    await expect(client.verifyOtp('123456')).rejects.toMatchObject({ code: 'ToolNotEnabled' });
    expect(client.getState().step).toBe('otp');
  });

  it('verifyOtp: un 403 SubscriptionRequired senza token resta un errore', async () => {
    const { client } = creaClient({
      ...OTP_OK,
      'otp-verify': () => json(403, { error: 'SubscriptionRequired', message: 'x' }),
    });
    await conCodice(client);

    await expect(client.verifyOtp('123456')).rejects.toBeInstanceOf(HubAuthError);
    expect(client.getState().step).toBe('otp');
  });

  it('verifyLink: passa allo step subscribe e consuma il link', async () => {
    window.history.replaceState({}, '', `/#hub_otp=${'a'.repeat(32)}`);
    const { client } = creaClient({ 'otp-verify-link': () => subscriptionRequired() }, { magicLink: true });
    await client.ready;
    expect(client.getState().step).toBe('link');

    await client.verifyLink();

    expect(client.getState().step).toBe('subscribe');
  });

  it('SSO all\'avvio: senza abbonamento va direttamente allo step subscribe', async () => {
    const { client } = creaClient({ 'sso/session': () => subscriptionRequired() }, { sso: true });
    await client.ready;

    await waitFor(() => expect(client.getState().step).toBe('subscribe'));
    expect(client.getState().status).toBe('anonymous');
  });
});

describe('sessione aperta senza più abbonamento', () => {
  const SESSIONE = { 'otp-request': () => json(200, {}), 'otp-verify': () => json(200, {
    user_id: 'u1', email: 'mario@esempio.it', session_token: 'SESS',
  }) };

  it('GET /me 403: esce con la notice subscription_required', async () => {
    const { client } = creaClient({ ...SESSIONE, me: () => json(403, { error: 'SubscriptionRequired' }) });
    await conCodice(client);

    await client.verifyOtp('123456');

    expect(client.getState().status).toBe('anonymous');
    expect(client.getState().notice).toBe('subscription_required');
  });

  it('authFetch: un 403 SubscriptionRequired durante l\'uso fa uscire', async () => {
    const { client } = creaClient({
      ...SESSIONE,
      me: () => json(200, { user_id: 'u1', email: 'mario@esempio.it', tools: ['fleet'] }),
      'fleet/sites': () => json(403, { error: 'SubscriptionRequired' }),
    });
    await conCodice(client);
    await client.verifyOtp('123456');
    expect(client.getState().status).toBe('authenticated');

    const res = await client.authFetch('fleet/sites');

    expect(res.status).toBe(403);
    await waitFor(() => expect(client.getState().notice).toBe('subscription_required'));
    expect(client.getState().status).toBe('anonymous');
  });

  it('authFetch: gli altri 403 non fanno uscire', async () => {
    const { client } = creaClient({
      ...SESSIONE,
      me: () => json(200, { user_id: 'u1', email: 'mario@esempio.it', tools: ['fleet'] }),
      'fleet/sites': () => json(403, { error: 'Forbidden' }),
    });
    await conCodice(client);
    await client.verifyOtp('123456');

    await client.authFetch('fleet/sites');

    expect(client.getState().status).toBe('authenticated');
  });
});

describe('rotte /billing con il token di pagamento', () => {
  async function inSubscribe(routes: Record<string, Handler> = {}) {
    const ctx = creaClient({ ...OTP_OK, 'otp-verify': () => subscriptionRequired('TOK1'), ...routes });
    await conCodice(ctx.client);
    await ctx.client.verifyOtp('123456');
    return ctx;
  }

  it('loadBillingCatalog invia X-Billing-Token', async () => {
    const { client, fetch } = await inSubscribe({ 'billing/catalog': () => json(200, CATALOG) });

    await expect(client.loadBillingCatalog()).resolves.toEqual(CATALOG);

    const [, init] = chiamate(fetch, 'billing/catalog')[0];
    expect(headerOf(init, 'X-Billing-Token')).toBe('TOK1');
    expect(headerOf(init, 'Authorization')).toBeNull();
  });

  it('billingQuote invia la scelta, mai importi', async () => {
    const { client, fetch } = await inSubscribe({ 'billing/quote': () => json(200, QUOTE) });

    await expect(client.billingQuote({ fleet_plan: 'starter', apps: ['voicenote'] })).resolves.toEqual(QUOTE);

    const [, init] = chiamate(fetch, 'billing/quote')[0];
    expect(JSON.parse(String(init?.body))).toEqual({ fleet_plan: 'starter', apps: ['voicenote'] });
  });

  it('un catalogo malformato è un errore', async () => {
    const { client } = await inSubscribe({ 'billing/catalog': () => json(200, { enabled: true }) });
    await expect(client.loadBillingCatalog()).rejects.toMatchObject({ code: 'InvalidResponse' });
  });

  it('token scaduto (401): si riparte dal login con la notice', async () => {
    const { client } = await inSubscribe({ 'billing/catalog': () => json(401, { error: 'Unauthorized' }) });

    await expect(client.loadBillingCatalog()).rejects.toMatchObject({ status: 401 });

    expect(client.getState().step).toBe('email');
    expect(client.getState().notice).toBe('session_expired');
  });

  it('startCheckout: crea l\'ordine, salva il token e porta a PayPal', async () => {
    const { client, fetch, redirect } = await inSubscribe({
      'billing/orders': () => json(201, { approve_url: 'https://www.paypal.com/checkoutnow?token=ORD1', subscription_id: 's1' }),
    });

    await client.startCheckout(ORDER);

    const [, init] = chiamate(fetch, 'billing/orders')[0];
    expect(headerOf(init, 'X-Billing-Token')).toBe('TOK1');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      fleet_plan: 'pro', tool: 'fleet', billing_name: 'Rossi Srl', billing_type: 'company', terms_accepted: true,
      billing_zip: '20121',
    });
    expect(redirect).toHaveBeenCalledWith('https://www.paypal.com/checkoutnow?token=ORD1');
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBe('TOK1');
    expect(client.getState().loading).toBe(false);
  });

  it('startCheckout rifiuta un indirizzo di approvazione non https', async () => {
    const { client, redirect } = await inSubscribe({
      'billing/orders': () => json(201, { approve_url: 'http://evil.test/paga' }),
    });

    await expect(client.startCheckout(ORDER))
      .rejects.toMatchObject({ code: 'InvalidResponse' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('startCheckout: gli errori di hub arrivano al chiamante', async () => {
    const { client, redirect } = await inSubscribe({
      'billing/orders': () => json(409, { error: 'BillingDisabled', message: 'No' }),
    });

    await expect(client.startCheckout(ORDER))
      .rejects.toMatchObject({ code: 'BillingDisabled' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('startCheckout: gli errori di campo di hub arrivano con il campo e senza «Value error»', async () => {
    const { client } = await inSubscribe({
      'billing/orders': () => json(400, {
        error: 'ValidationError',
        detail: [
          { type: 'value_error', loc: ['vat_number'], msg: 'Value error, Partita IVA non valida' },
          { type: 'value_error', loc: ['billing_zip'], msg: 'CAP non valido: cinque cifre' },
        ],
      }),
    });

    const err = await client.startCheckout(ORDER).then(() => null, (e: unknown) => e);

    expect(err).toMatchObject({ status: 400, code: 'ValidationError' });
    expect((err as { fieldErrors: unknown }).fieldErrors).toEqual([
      { field: 'vat_number', message: 'Partita IVA non valida' },
      { field: 'billing_zip', message: 'CAP non valido: cinque cifre' },
    ]);
  });

  it('suggestAddress: GET con ricerca e sessione, X-Billing-Token, lista dei suggerimenti', async () => {
    const { client, fetch } = await inSubscribe({
      'billing/address/suggest': () => json(200, { suggestions: [{ place_id: 'p1', text: 'Via Roma 1, Milano' }] }),
    });

    await expect(client.suggestAddress('via roma', 'sessione-1')).resolves.toEqual([{ place_id: 'p1', text: 'Via Roma 1, Milano' }]);

    const [input, init] = chiamate(fetch, 'billing/address/suggest')[0];
    expect(String(input)).toContain('q=via+roma');
    expect(String(input)).toContain('session=sessione-1');
    expect(headerOf(init, 'X-Billing-Token')).toBe('TOK1');
  });

  it('suggestAddress: servizio non disponibile = lista vuota', async () => {
    const { client } = await inSubscribe({
      'billing/address/suggest': () => json(200, { suggestions: [], unavailable: true }),
    });
    await expect(client.suggestAddress('via roma', 'sessione-1')).resolves.toEqual([]);
  });

  it('addressDetails: indirizzo pronto per il modulo, oppure null se il servizio non c\'è', async () => {
    let risposta: unknown = { address: 'Via Roma 1', zip: '20121', city: 'Milano', province: 'MI', country: 'IT' };
    const { client, fetch } = await inSubscribe({ 'billing/address/details': () => json(200, risposta) });

    await expect(client.addressDetails('p1', 'sessione-1')).resolves.toEqual(
      { address: 'Via Roma 1', zip: '20121', city: 'Milano', province: 'MI', country: 'IT' });
    expect(String(chiamate(fetch, 'billing/address/details')[0][0])).toContain('place_id=p1');

    risposta = { unavailable: true };
    await expect(client.addressDetails('p1', 'sessione-1')).resolves.toBeNull();
  });

  it('resetToEmail dimentica il token di pagamento', async () => {
    const { client } = await inSubscribe({
      'billing/orders': () => json(201, { approve_url: 'https://www.paypal.com/x' }),
    });
    await client.startCheckout(ORDER);
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBe('TOK1');

    client.resetToEmail();

    expect(window.sessionStorage.getItem(BILLING_KEY)).toBeNull();
    expect(client.getState().step).toBe('email');
  });
});

describe('rotte /billing con la sessione (anteprima admin)', () => {
  it('senza token di pagamento usa il Bearer della sessione', async () => {
    const { client, fetch } = creaClient({
      'otp-request': () => json(200, {}),
      'otp-verify': () => json(200, { user_id: 'a1', email: 'a@esempio.it', session_token: 'SESS' }),
      me: () => json(200, { user_id: 'a1', email: 'a@esempio.it', role: 'admin', tools: [] }),
      'billing/catalog': () => json(200, CATALOG),
    });
    await conCodice(client);
    await client.verifyOtp('123456');

    await client.loadBillingCatalog();

    const [, init] = chiamate(fetch, 'billing/catalog')[0];
    expect(headerOf(init, 'Authorization')).toBe('Bearer SESS');
    expect(headerOf(init, 'X-Billing-Token')).toBeNull();
  });
});

describe('ritorno da PayPal', () => {
  const SESSIONE_OK = {
    user_id: 'u1', email: 'mario@esempio.it', session_token: 'NUOVA',
  };

  it('billing=paid con il token salvato: apre la sessione senza un nuovo codice', async () => {
    window.sessionStorage.setItem(BILLING_KEY, 'TOK1');
    window.history.replaceState({}, '', '/?billing=paid');
    const { client, fetch } = creaClient({
      'billing/complete': () => json(200, SESSIONE_OK),
      me: () => json(200, { user_id: 'u1', email: 'mario@esempio.it', tools: ['fleet'] }),
    });
    await client.ready;

    await waitFor(() => expect(client.getState().status).toBe('authenticated'));

    const [, init] = chiamate(fetch, 'billing/complete')[0];
    expect(headerOf(init, 'X-Billing-Token')).toBe('TOK1');
    expect(client.getState().token).toBe('NUOVA');
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBeNull();
    // L'esito non resta nell'URL
    expect(window.location.search).toBe('');
  });

  it('billing=paid senza token: avviso e si accede con l\'email', async () => {
    window.history.replaceState({}, '', '/?billing=paid&altro=1');
    const { client } = creaClient({});
    await client.ready;

    await waitFor(() => expect(client.getState().status).toBe('anonymous'));

    expect(client.getState().notice).toBe('payment_received');
    expect(client.getState().step).toBe('email');
    expect(window.location.search).toBe('?altro=1');
  });

  it('billing=paid ma hub non vede ancora il pagamento: notice payment_pending', async () => {
    window.sessionStorage.setItem(BILLING_KEY, 'TOK1');
    window.history.replaceState({}, '', '/?billing=paid');
    const { client } = creaClient({ 'billing/complete': () => subscriptionRequired('NUOVO') });
    await client.ready;

    await waitFor(() => expect(client.getState().notice).toBe('payment_pending'));

    expect(client.getState().step).toBe('email');
    expect(client.getState().status).toBe('anonymous');
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBeNull();
  });

  it('billing=cancelled con il token: si riapre la scelta', async () => {
    window.sessionStorage.setItem(BILLING_KEY, 'TOK1');
    window.history.replaceState({}, '', '/?billing=cancelled');
    const { client } = creaClient({});
    await client.ready;

    await waitFor(() => expect(client.getState().step).toBe('subscribe'));

    expect(client.getState().status).toBe('anonymous');
  });

  it.each([
    ['pending', 'payment_pending'],
    ['error', 'payment_failed'],
  ])('billing=%s: avviso %s e token dimenticato', async (esito, notice) => {
    window.sessionStorage.setItem(BILLING_KEY, 'TOK1');
    window.history.replaceState({}, '', `/?billing=${esito}`);
    const { client } = creaClient({});
    await client.ready;

    await waitFor(() => expect(client.getState().status).toBe('anonymous'));

    expect(client.getState().notice).toBe(notice);
    expect(client.getState().step).toBe('email');
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBeNull();
  });

  it('senza ?billing nell\'URL il token salvato non viene letto', async () => {
    window.sessionStorage.setItem(BILLING_KEY, 'TOK1');
    const { client, fetch } = creaClient({});
    await client.ready;

    expect(client.getState().step).toBe('email');
    expect(chiamate(fetch, 'billing')).toHaveLength(0);
  });
});

describe('LoginScreen allo step subscribe', () => {
  async function conStepSubscribe(catalog: () => Response) {
    const ctx = creaClient({
      ...OTP_OK,
      'otp-verify': () => subscriptionRequired(),
      'auth/tool-config': () => json(200, { tool: null, signup_enabled: false, privacy: null }),
      'billing/catalog': catalog,
      'billing/quote': () => json(200, QUOTE),
    });
    await conCodice(ctx.client);
    await ctx.client.verifyOtp('123456');
    render(<HubAuthProvider client={ctx.client}><LoginScreen title="Fleet" /></HubAuthProvider>);
    return ctx;
  }

  it('carica il listino e mostra il form di pagamento', async () => {
    await conStepSubscribe(() => json(200, CATALOG));

    expect(await screen.findByText('Scegli il tuo piano')).toBeTruthy();
    expect(await screen.findByText('IVA 22%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ordina con obbligo di pagamento' })).toBeTruthy();
  });

  it('con i pagamenti non attivi dice che non sono disponibili', async () => {
    await conStepSubscribe(() => json(200, { ...CATALOG, enabled: false }));

    expect(await screen.findByText(/pagamenti non sono al momento disponibili/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ordina con obbligo di pagamento' })).toBeNull();
  });

  it('listino non caricabile: errore e si può tornare all\'accesso', async () => {
    const { client } = await conStepSubscribe(() => json(500, { error: 'ServerError', message: 'Errore del server.' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "Torna all'accesso" }));

    expect(client.getState().step).toBe('email');
  });
});
