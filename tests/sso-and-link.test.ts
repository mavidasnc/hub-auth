/**
 * Test di SSO (cookie) e magic link dell'email OTP (1.2.0).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter } from '../src/core/index.js';

const BASE = 'https://hub.test/v1/';
const TOKEN = 'A'.repeat(43); // forma di secrets.token_urlsafe(32)
const ME = { user_id: 'u1', email: 'mario@esempio.com', username: 'mario', role: 'user', plan: 'pro',
             status: 'active', expires_at: null, tools: ['log'] };
const LOGIN = { user_id: 'u1', email: 'mario@esempio.com', session_token: 'tok', expires_at: 'x' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch finta guidata da una tabella "METODO path" → risposta */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(BASE, '');
    const handler = routes[`${init?.method ?? 'GET'} ${url}`];
    if (!handler) throw new Error(`rotta non prevista: ${init?.method ?? 'GET'} ${url}`);
    return handler();
  });
}

/** Chiamate a una rotta: [url, init] */
const callsTo = (fetch: ReturnType<typeof fakeFetch>, route: string) =>
  fetch.mock.calls.filter(([url]) => String(url).replace(BASE, '') === route);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Imposta il fragment dell'URL come farebbe l'apertura del link dell'email */
const openLink = (hash: string) => window.history.replaceState(null, '', `/app/${hash}`);

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => window.history.replaceState(null, '', '/'));

describe('magic link: apertura', () => {
  it('legge il token dal fragment, lo rimuove dall\'URL e passa allo step link', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}) });
    await auth.ready;

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().step).toBe('link');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app/');
    // Il token resta in memoria: non è osservabile dallo stato (né salvato altrove)
    expect(JSON.stringify(auth.getState())).not.toContain(TOKEN);
  });

  it('conserva gli altri parametri del fragment', async () => {
    openLink(`#sezione=x&hub_otp=${TOKEN}`);
    createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}) });
    expect(window.location.hash).toBe('#sezione=x');
  });

  it('un token malformato viene rimosso dall\'URL ma ignorato', async () => {
    openLink('#hub_otp=corto!');
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}) });
    await auth.ready;

    expect(auth.getState().step).toBe('email');
    expect(auth.getState().status).toBe('anonymous');
    expect(window.location.hash).toBe('');
  });

  it('con magicLink: false non tocca l\'URL né cambia step', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const auth = createHubAuth({
      baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}), magicLink: false,
    });
    await auth.ready;

    expect(auth.getState().step).toBe('email');
    expect(window.location.hash).toBe(`#hub_otp=${TOKEN}`);
  });

  it('con una sessione già salvata ignora il link e si autentica con /me', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'saved', user: null });
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });
    await flush();

    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().step).toBe('email');
    expect(callsTo(fetch, 'otp-verify-link')).toHaveLength(0);
  });

  it('requestOtp con magicLink: false non chiede il link', async () => {
    const fetch = fakeFetch({ 'POST otp-request': () => json(200, { success: true }) });
    const auth = createHubAuth({
      baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch, magicLink: false,
    });
    await auth.ready;
    await auth.requestOtp('mario@esempio.com');

    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ email: 'mario@esempio.com' });
  });
});

describe('magic link: conferma', () => {
  it('verifyLink invia token e tool, apre la sessione e carica /me', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const storage = memoryStorageAdapter();
    const fetch = fakeFetch({
      'POST otp-verify-link': () => json(200, LOGIN),
      'GET me?tool=log': () => json(200, ME),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', tool: 'log', storage, fetch });
    await auth.ready;

    await auth.verifyLink();

    expect(JSON.parse(String(callsTo(fetch, 'otp-verify-link')[0][1]?.body))).toEqual({ token: TOKEN, tool: 'log' });
    const state = auth.getState();
    expect(state.status).toBe('authenticated');
    expect(state.token).toBe('tok');
    expect(state.step).toBe('email');
    expect(state.user?.role).toBe('user');
    expect((storage.get('k') as { token: string }).token).toBe('tok');
  });

  it('il link non apre nulla finché non c\'è la conferma (nessuna chiamata automatica)', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const fetch = fakeFetch({});
    createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('un link non valido (401) riporta al login con la notice, senza lanciare', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const fetch = fakeFetch({ 'POST otp-verify-link': () => json(401, { error: 'Link non valido o scaduto.' }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.ready;

    await expect(auth.verifyLink()).resolves.toBeUndefined();

    expect(auth.getState().step).toBe('email');
    expect(auth.getState().notice).toBe('link_invalid');
    expect(auth.getState().loading).toBe(false);
    // Il link è morto: un secondo tentativo non parte nemmeno
    await expect(auth.verifyLink()).rejects.toMatchObject({ code: 'InvalidLink' });
    expect(callsTo(fetch, 'otp-verify-link')).toHaveLength(1);
  });

  it('ToolNotEnabled e TrialExpired diventano notice, senza sessione', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const fetch = fakeFetch({ 'POST otp-verify-link': () => json(403, { error: 'ToolNotEnabled', message: 'no' }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.ready;

    await auth.verifyLink();

    expect(auth.getState().notice).toBe('tool_not_enabled');
    expect(auth.getState().token).toBeNull();
  });

  it('un errore di rete o 429 viene lanciato e il link resta riutilizzabile', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    let n = 0;
    const fetch = fakeFetch({
      'POST otp-verify-link': () => (++n === 1 ? json(429, { error: 'Troppi tentativi.' }) : json(200, LOGIN)),
      'GET me': () => json(200, ME),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.ready;

    await expect(auth.verifyLink()).rejects.toMatchObject({ status: 429 });
    expect(auth.getState().step).toBe('link');

    await auth.verifyLink();
    expect(auth.getState().status).toBe('authenticated');
  });

  it('cancelLink scarta il link e torna allo step email', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}) });
    await auth.ready;

    auth.cancelLink();

    expect(auth.getState().step).toBe('email');
    await expect(auth.verifyLink()).rejects.toMatchObject({ code: 'InvalidLink' });
  });
});

describe('SSO: avvio', () => {
  it('senza sso non chiama mai sso/session', async () => {
    const fetch = fakeFetch({});
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('con sso e senza sessione scambia il cookie (credentials: include, tool)', async () => {
    const fetch = fakeFetch({
      'POST sso/session': () => json(200, LOGIN),
      'GET me?tool=log': () => json(200, ME),
    });
    const storage = memoryStorageAdapter();
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', tool: 'log', sso: true, storage, fetch });
    // Mentre attende lo scambio lo stato resta 'checking': AuthGate mostra il loading, non il login
    expect(auth.getState().status).toBe('checking');
    await flush();

    const [, init] = callsTo(fetch, 'sso/session')[0];
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({ tool: 'log' });
    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().token).toBe('tok');
    expect((storage.get('k') as { token: string }).token).toBe('tok');
  });

  it('401 NoSession: va al login senza alcun avviso', async () => {
    const fetch = fakeFetch({ 'POST sso/session': () => json(401, { error: 'NoSession' }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBeNull();
  });

  it('403 ToolNotEnabled: login con l\'avviso, nessuna sessione', async () => {
    const fetch = fakeFetch({ 'POST sso/session': () => json(403, { error: 'ToolNotEnabled', message: 'no' }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('tool_not_enabled');
    expect(auth.getState().token).toBeNull();
  });

  it('rete assente o CORS non configurata: va al login', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(auth.getState().status).toBe('anonymous');
  });

  it('con un magic link aperto non tenta l\'SSO: prima la conferma', async () => {
    openLink(`#hub_otp=${TOKEN}`);
    const fetch = fakeFetch({});
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();

    expect(auth.getState().step).toBe('link');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('con una sessione salvata non tenta l\'SSO', async () => {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'saved', user: null });
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage, fetch });
    await flush();

    expect(callsTo(fetch, 'sso/session')).toHaveLength(0);
  });
});

describe('SSO: login', () => {
  const routes = () => ({
    'POST otp-request': () => json(200, { success: true }),
    'GET me': () => json(200, ME),
  });

  it('verifyOtp con sso invia sso: true e le credenziali', async () => {
    const fetch = fakeFetch({ ...routes(), 'POST sso/session': () => json(401, { error: 'NoSession' }),
                              'POST otp-verify': () => json(200, LOGIN) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();
    await auth.requestOtp('mario@esempio.com');
    await auth.verifyOtp('123456');

    const [, init] = callsTo(fetch, 'otp-verify')[0];
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toMatchObject({ otp_code: '123456', sso: true });
    expect(auth.getState().status).toBe('authenticated');
  });

  it('senza sso nessuna credenziale e nessun campo sso', async () => {
    const fetch = fakeFetch({ ...routes(), 'POST otp-verify': () => json(200, LOGIN) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.requestOtp('mario@esempio.com');
    await auth.verifyOtp('123456');

    const [, init] = callsTo(fetch, 'otp-verify')[0];
    expect(init?.credentials).toBeUndefined();
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('sso');
  });

  it('se la CORS con credenziali non è configurata riprova senza SSO e il login riesce', async () => {
    let n = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).replace(BASE, '');
      if (url === 'otp-verify') {
        // Prima chiamata (con credenziali): il browser blocca al preflight → errore di rete
        if (++n === 1) throw new TypeError('Failed to fetch');
        return json(200, LOGIN);
      }
      if (url === 'sso/session') return json(401, { error: 'NoSession' });
      return routes()[`${init?.method ?? 'GET'} ${url}` as keyof ReturnType<typeof routes>]();
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();
    await auth.requestOtp('mario@esempio.com');
    await auth.verifyOtp('123456');

    const verifyCalls = fetch.mock.calls.filter(([u]) => String(u).endsWith('otp-verify'));
    expect(verifyCalls).toHaveLength(2);
    expect(verifyCalls[1][1]?.credentials).toBeUndefined();
    expect(JSON.parse(String(verifyCalls[1][1]?.body))).not.toHaveProperty('sso');
    expect(auth.getState().status).toBe('authenticated');
  });

  it('mentre attende il codice, al ritorno sulla scheda entra da solo se esiste la sessione SSO', async () => {
    let sso = 401;
    const fetch = fakeFetch({
      ...routes(),
      'POST sso/session': () => (sso === 200 ? json(200, LOGIN) : json(401, { error: 'NoSession' })),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', sso: true, storage: memoryStorageAdapter(), fetch });
    await flush();
    await auth.requestOtp('mario@esempio.com');
    expect(auth.getState().step).toBe('otp');

    // Il link aperto in un'altra scheda crea la sessione SSO; qui torna il focus
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(auth.getState().status).toBe('anonymous');

    sso = 200;
    window.dispatchEvent(new Event('focus'));
    await flush();

    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().step).toBe('email');
    expect(auth.getState().pendingEmail).toBe('');
  });
});

describe('logout con SSO', () => {
  async function loggedIn(config: { sso?: boolean } = {}) {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: null });
    const fetch = fakeFetch({
      'GET me': () => json(200, ME),
      'POST logout': () => json(200, { success: true }),
      'POST logout?scope=global': () => json(200, { success: true }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch, ...config });
    await flush();
    return { auth, fetch };
  }

  it('con sso il logout dell\'utente è globale e invia le credenziali', async () => {
    const { auth, fetch } = await loggedIn({ sso: true });
    auth.logout();

    const [, init] = callsTo(fetch, 'logout?scope=global')[0];
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(auth.getState().status).toBe('anonymous');
  });

  it('{ global: false } fa il solo logout locale', async () => {
    const { auth, fetch } = await loggedIn({ sso: true });
    auth.logout(undefined, { global: false });

    expect(callsTo(fetch, 'logout')).toHaveLength(1);
    expect(callsTo(fetch, 'logout?scope=global')).toHaveLength(0);
  });

  it('un logout con notice resta locale (tool non abilitato non deve chiudere l\'SSO)', async () => {
    const { auth, fetch } = await loggedIn({ sso: true });
    auth.logout('tool_not_enabled');

    expect(callsTo(fetch, 'logout')).toHaveLength(1);
    expect(callsTo(fetch, 'logout?scope=global')).toHaveLength(0);
    expect(auth.getState().notice).toBe('tool_not_enabled');
  });

  it('senza sso il logout è sempre locale, anche se richiesto globale', async () => {
    const { auth, fetch } = await loggedIn();
    auth.logout(undefined, { global: true });

    expect(callsTo(fetch, 'logout')).toHaveLength(1);
    expect(callsTo(fetch, 'logout?scope=global')).toHaveLength(0);
  });

  it('un evento passato a logout (onClick={logout}) non viene scambiato per una notice', async () => {
    const { auth, fetch } = await loggedIn({ sso: true });
    (auth.logout as unknown as (e: unknown) => void)(new Event('click'));

    expect(auth.getState().notice).toBeNull();
    expect(callsTo(fetch, 'logout?scope=global')).toHaveLength(1);
  });
});
