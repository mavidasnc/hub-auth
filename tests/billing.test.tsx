/**
 * Test della 1.14.0: pagamento con PayPal (hub >= 0.267.0). Core del client (403
 * SubscriptionRequired, token di pagamento, ritorno da PayPal) e componenti
 * (SubscribePicker, SubscribeStep dentro LoginScreen).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, HubAuthError, memoryStorageAdapter } from '../src/core/index.js';
import type { BillingCatalog, BillingQuote } from '../src/core/index.js';
import { HubAuthProvider } from '../src/react/index.js';
import { LoginScreen, SubscribePicker } from '../src/ui/index.js';

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

    await client.startCheckout({ fleet_plan: 'pro', apps: [], billing_name: 'Rossi Srl', vat_number: 'IT01234567890' });

    const [, init] = chiamate(fetch, 'billing/orders')[0];
    expect(headerOf(init, 'X-Billing-Token')).toBe('TOK1');
    expect(JSON.parse(String(init?.body))).toMatchObject({ fleet_plan: 'pro', tool: 'fleet', billing_name: 'Rossi Srl' });
    expect(redirect).toHaveBeenCalledWith('https://www.paypal.com/checkoutnow?token=ORD1');
    expect(window.sessionStorage.getItem(BILLING_KEY)).toBe('TOK1');
    expect(client.getState().loading).toBe(false);
  });

  it('startCheckout rifiuta un indirizzo di approvazione non https', async () => {
    const { client, redirect } = await inSubscribe({
      'billing/orders': () => json(201, { approve_url: 'http://evil.test/paga' }),
    });

    await expect(client.startCheckout({ fleet_plan: 'pro', apps: [], billing_name: 'Rossi', tax_code: 'RSSMRA80A01H501U' }))
      .rejects.toMatchObject({ code: 'InvalidResponse' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('startCheckout: gli errori di hub arrivano al chiamante', async () => {
    const { client, redirect } = await inSubscribe({
      'billing/orders': () => json(409, { error: 'BillingDisabled', message: 'No' }),
    });

    await expect(client.startCheckout({ fleet_plan: 'pro', apps: [], billing_name: 'Rossi', tax_code: 'X' }))
      .rejects.toMatchObject({ code: 'BillingDisabled' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('resetToEmail dimentica il token di pagamento', async () => {
    const { client } = await inSubscribe({
      'billing/orders': () => json(201, { approve_url: 'https://www.paypal.com/x' }),
    });
    await client.startCheckout({ fleet_plan: 'pro', apps: [], billing_name: 'Rossi', tax_code: 'X' });
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

describe('SubscribePicker', () => {
  function monta(props: Partial<React.ComponentProps<typeof SubscribePicker>> = {}) {
    const onQuote = vi.fn(async () => QUOTE);
    const onSubmit = vi.fn(async () => undefined);
    render(<SubscribePicker catalog={CATALOG} onQuote={onQuote} onSubmit={onSubmit} {...props} />);
    return { onQuote, onSubmit };
  }

  it('mostra piani con siti e prezzo mensile, app e riepilogo con IVA dal server', async () => {
    const { onQuote } = monta();

    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('fino a 25 siti')).toBeTruthy();
    expect(screen.getByLabelText('VoiceNote')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());
    // Si parte dal primo piano, il prezzo lo chiede a hub
    expect(onQuote).toHaveBeenCalledWith({ fleet_plan: 'starter', apps: [] });
    expect(screen.getByText(/175,68/)).toBeTruthy();
    expect(screen.getByText(/Prezzo di lancio valido fino al 31\/12\/2026/)).toBeTruthy();
  });

  it('cambiando piano e app chiede un nuovo prezzo', async () => {
    const { onQuote } = monta();
    await waitFor(() => expect(onQuote).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/Pro/));
    fireEvent.click(screen.getByLabelText('Wandly'));

    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith({ fleet_plan: 'pro', apps: ['wandly'] }));
  });

  it('"solo app" manda fleet_plan null', async () => {
    const { onQuote } = monta();
    fireEvent.click(screen.getByLabelText('Solo le app, senza Fleet'));
    fireEvent.click(screen.getByLabelText('VoiceNote'));

    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith({ fleet_plan: null, apps: ['voicenote'] }));
  });

  it('senza piano né app non chiede il prezzo e il pagamento è disattivato', async () => {
    const { onQuote } = monta();
    await waitFor(() => expect(onQuote).toHaveBeenCalledTimes(1));
    onQuote.mockClear();

    fireEvent.click(screen.getByLabelText('Solo le app, senza Fleet'));

    expect(onQuote).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Paga con PayPal' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chiede i dati fiscali prima di inviare', async () => {
    const { onSubmit } = monta();
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Ragione sociale o nome e cognome'), { target: { value: 'Rossi Srl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paga con PayPal' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Indica la partita IVA o il codice fiscale.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('invia scelta e dati di fatturazione', async () => {
    const { onSubmit } = monta();
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Ragione sociale o nome e cognome'), { target: { value: ' Rossi Srl ' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: 'IT01234567890' } });
    fireEvent.click(screen.getByLabelText('VoiceNote'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Paga con PayPal' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Paga con PayPal' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      fleet_plan: 'starter', apps: ['voicenote'], billing_name: 'Rossi Srl',
      vat_number: 'IT01234567890', billing_country: 'IT',
    });
  });

  it('mostra l\'errore di hub in italiano', async () => {
    const onSubmit = vi.fn(async () => { throw new HubAuthError('x', 409, 'BillingDisabled'); });
    monta({ onSubmit });
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Ragione sociale o nome e cognome'), { target: { value: 'Rossi Srl' } });
    fireEvent.change(screen.getByLabelText('Codice fiscale'), { target: { value: 'RSSMRA80A01H501U' } });

    fireEvent.click(screen.getByRole('button', { name: 'Paga con PayPal' }));

    expect(await screen.findByText('I pagamenti non sono attivi.')).toBeTruthy();
  });

  it('anteprima: pagamento disattivato e avviso, anche con tutto compilato', async () => {
    const { onSubmit } = monta({ preview: true });
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());

    expect(screen.getByText('Anteprima: il pagamento è disattivato.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Paga con PayPal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('senza onSubmit il pagamento è disattivato', async () => {
    monta({ onSubmit: undefined });
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Paga con PayPal' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('funziona senza Provider (serve all\'anteprima della dashboard admin)', async () => {
    expect(() => monta()).not.toThrow();
  });

  it('un errore del preventivo lascia il riepilogo vuoto', async () => {
    const onQuote = vi.fn(async () => { throw new HubAuthError('x', 400, 'InvalidSelection'); });
    monta({ onQuote });
    await waitFor(() => expect(onQuote).toHaveBeenCalled());
    expect(screen.queryByText('IVA 22%')).toBeNull();
    expect((screen.getByRole('button', { name: 'Paga con PayPal' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

/** Listino della prima fase dei pagamenti (hub >= 0.269.0): solo piani, con descrizione, app incluse */
const CATALOG_FASE_1: BillingCatalog = {
  ...CATALOG,
  plans: [
    { code: 'starter', label: 'Starter', description: 'Per iniziare con calma.', monthly_cents: 1200,
      list_monthly_cents: 1500, launch_monthly_cents: 1200, app_discount_pct: 0, sites_max: 10 },
    { code: 'pro', label: 'Pro', description: 'Per chi lavora ogni giorno.', monthly_cents: 2400,
      list_monthly_cents: 3000, launch_monthly_cents: 2400, app_discount_pct: 20, sites_max: 25 },
    { code: 'agency', label: 'Agency', description: null, monthly_cents: 4020,
      list_monthly_cents: 5025, launch_monthly_cents: 4020, app_discount_pct: 33, sites_max: null },
  ],
  apps: [],
  app_tiers: [],
  apps_included_months: 3,
};

describe('SubscribePicker: solo piani Fleet (1.15.0)', () => {
  function monta(catalog: BillingCatalog = CATALOG_FASE_1) {
    const onQuote = vi.fn(async () => QUOTE);
    const onSubmit = vi.fn(async () => undefined);
    const { container, unmount } = render(<SubscribePicker catalog={catalog} onQuote={onQuote} onSubmit={onSubmit} />);
    return { onQuote, onSubmit, container, unmount };
  }

  it('mostra i tre piani in colonne, uno per radio', async () => {
    const { container } = monta();

    const colonne = container.querySelectorAll('.hub-auth__plans > .hub-auth__option--plan');
    expect(colonne).toHaveLength(3);
    expect(container.querySelectorAll('input[name="hub-auth-plan"]')).toHaveLength(3);
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());
  });

  it('per ogni piano: descrizione, listino barrato, mensile di lancio e annuale di lancio', () => {
    monta();

    expect(screen.getByText('Per iniziare con calma.')).toBeTruthy();
    expect(screen.getByText('Per chi lavora ogni giorno.')).toBeTruthy();
    // Listino barrato solo con il prezzo di lancio in vigore
    const listino = screen.getByText(/Listino 15,00/);
    expect(listino.tagName).toBe('S');
    expect(screen.getByText(/12,00.*al mese/)).toBeTruthy();
    // Annuale = mensile x 12: 12 x 12 = 144, 24 x 12 = 288, 40,20 x 12 = 482,40
    expect(screen.getByText(/144,00.*all'anno/)).toBeTruthy();
    expect(screen.getByText(/288,00.*all'anno/)).toBeTruthy();
    expect(screen.getByText(/482,40.*all'anno/)).toBeTruthy();
  });

  it('senza descrizione la card non mostra un testo vuoto', () => {
    const { container } = monta();

    expect(container.querySelectorAll('.hub-auth__option-desc')).toHaveLength(2);
  });

  it('dopo il lancio vale il listino e non c\'è il prezzo barrato', () => {
    const dopo: BillingCatalog = {
      ...CATALOG_FASE_1,
      price_basis: 'list',
      plans: CATALOG_FASE_1.plans.map((p) => ({ ...p, monthly_cents: p.list_monthly_cents })),
    };
    const { container } = monta(dopo);

    expect(container.querySelectorAll('.hub-auth__option-list')).toHaveLength(0);
    expect(screen.getByText(/15,00.*al mese/)).toBeTruthy();
  });

  it('niente opzione "solo app" né elenco app', () => {
    monta();

    expect(screen.queryByLabelText('Solo le app, senza Fleet')).toBeNull();
    expect(screen.queryByText('App')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('dice per quanti mesi sono incluse le app', () => {
    monta();
    expect(screen.getByText('Con un piano Fleet le app Mavida sono incluse per 3 mesi.')).toBeTruthy();
  });

  it('un mese solo al singolare, nessuna riga con 0 mesi o senza il campo', () => {
    const { unmount } = monta({ ...CATALOG_FASE_1, apps_included_months: 1 });
    expect(screen.getByText('Con un piano Fleet le app Mavida sono incluse per 1 mese.')).toBeTruthy();
    unmount();

    const { unmount: unmount2 } = monta({ ...CATALOG_FASE_1, apps_included_months: 0 });
    expect(screen.queryByText(/sono incluse per/)).toBeNull();
    unmount2();

    const { apps_included_months: _omesso, ...senzaCampo } = CATALOG_FASE_1;
    monta(senzaCampo);
    expect(screen.queryByText(/sono incluse per/)).toBeNull();
  });

  it('chiede il prezzo del solo piano scelto, senza app', async () => {
    const { onQuote } = monta();

    await waitFor(() => expect(onQuote).toHaveBeenCalledWith({ fleet_plan: 'starter', apps: [] }));
    fireEvent.click(screen.getByLabelText(/Agency/));
    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith({ fleet_plan: 'agency', apps: [] }));
  });

  it('senza piani il messaggio chiede un piano, non un\'app', () => {
    monta({ ...CATALOG_FASE_1, plans: [] });

    expect(screen.getByText('Scegli un piano.')).toBeTruthy();
    expect(screen.queryByText("Scegli un piano o almeno un'app.")).toBeNull();
  });

  it('invia solo il piano scelto e i dati di fatturazione', async () => {
    const { onSubmit } = monta();
    await waitFor(() => expect(screen.getByText('IVA 22%')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Ragione sociale o nome e cognome'), { target: { value: 'Rossi Srl' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: 'IT01234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paga con PayPal' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      fleet_plan: 'starter', apps: [], billing_name: 'Rossi Srl',
      vat_number: 'IT01234567890', billing_country: 'IT',
    });
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

    expect(await screen.findByText('Scegli il tuo abbonamento')).toBeTruthy();
    expect(await screen.findByText('IVA 22%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paga con PayPal' })).toBeTruthy();
  });

  it('con i pagamenti non attivi dice che non sono disponibili', async () => {
    await conStepSubscribe(() => json(200, { ...CATALOG, enabled: false }));

    expect(await screen.findByText(/pagamenti non sono al momento disponibili/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Paga con PayPal' })).toBeNull();
  });

  it('listino non caricabile: errore e si può tornare all\'accesso', async () => {
    const { client } = await conStepSubscribe(() => json(500, { error: 'ServerError', message: 'Errore del server.' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "Torna all'accesso" }));

    expect(client.getState().step).toBe('email');
  });
});
