/**
 * Test del core: flusso OTP, boot con /me, guardia 401, logout, legacy, axios.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHubAuth, HubAuthError, memoryStorageAdapter, type StorageAdapter } from '../src/core/index.js';

const BASE = 'https://hub.test/v1/';
const ME = { user_id: 'u1', email: 'mario@esempio.com', username: 'mario', role: 'user', plan: 'pro',
             status: 'active', expires_at: null, tools: ['voicenote'] };

/** Risposta JSON finta */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch finta guidata da una tabella "METODO path" → risposta */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(BASE, '');
    const key = `${init?.method ?? 'GET'} ${url}`;
    // URL fuori da BASE (test sull'origine del Bearer): risposta vuota
    if (!String(input).startsWith(BASE) && !routes[key]) return json(200, {});
    const handler = routes[key];
    if (!handler) throw new Error(`rotta non prevista: ${key}`);
    return handler();
  });
}

/** Aspetta che le promise in coda (fetch finte, refresh) siano risolte */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function storedSession(storage: StorageAdapter, key = 'app:session') {
  return storage.get(key) as { token: string; user: { user_id: string } } | null;
}

describe('login OTP', () => {
  it('requestOtp normalizza l\'email e passa allo step otp', async () => {
    const fetch = fakeFetch({ 'POST otp-request': () => json(200, { success: true }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage: memoryStorageAdapter(), fetch });
    await auth.ready;

    await auth.requestOtp('  Mario@Esempio.COM ');

    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    // link: true = il client sa gestire il magic link dell'email (1.2.0)
    expect(body).toEqual({ email: 'mario@esempio.com', link: true });
    expect(auth.getState().step).toBe('otp');
    expect(auth.getState().pendingEmail).toBe('mario@esempio.com');
    expect(auth.getState().otpRequestedAt).not.toBeNull();
  });

  describe('«Ricordami» (1.16.0)', () => {
    /** Corpo di ogni otp-request inviato, nell'ordine */
    const otpBodies = (fetch: ReturnType<typeof fakeFetch>) => fetch.mock.calls
      .filter(([url]) => String(url).endsWith('otp-request'))
      .map(([, init]) => JSON.parse(String(init?.body)));

    const nuovoClient = () => {
      const fetch = fakeFetch({ 'POST otp-request': () => json(200, { success: true }) });
      const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
      return { fetch, auth };
    };

    it('con remember: true il corpo contiene remember', async () => {
      const { fetch, auth } = nuovoClient();
      await auth.requestOtp('mario@esempio.com', { remember: true });
      expect(otpBodies(fetch)[0]).toEqual({ email: 'mario@esempio.com', link: true, remember: true });
    });

    it('con remember: false, o senza opzioni, il corpo è quello di prima', async () => {
      const { fetch, auth } = nuovoClient();
      await auth.requestOtp('mario@esempio.com', { remember: false });
      auth.resetToEmail();
      await auth.requestOtp('mario@esempio.com');
      expect(otpBodies(fetch)).toEqual([
        { email: 'mario@esempio.com', link: true },
        { email: 'mario@esempio.com', link: true },
      ]);
    });

    it('il reinvio al passo codice ripete la scelta', async () => {
      const { fetch, auth } = nuovoClient();
      await auth.requestOtp('mario@esempio.com', { remember: true });
      await auth.requestOtp('mario@esempio.com'); // reinvio: stessa email, step 'otp'
      expect(otpBodies(fetch)[1]).toMatchObject({ remember: true });
    });

    it('una nuova richiesta dopo "cambia email" non eredita la scelta', async () => {
      const { fetch, auth } = nuovoClient();
      await auth.requestOtp('mario@esempio.com', { remember: true });
      auth.resetToEmail();
      await auth.requestOtp('mario@esempio.com');
      expect(otpBodies(fetch)[1]).not.toHaveProperty('remember');
    });

    it('con magicLink spento il corpo ha solo email e remember', async () => {
      const fetch = fakeFetch({ 'POST otp-request': () => json(200, { success: true }) });
      const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch, magicLink: false });
      await auth.requestOtp('mario@esempio.com', { remember: true });
      expect(otpBodies(fetch)[0]).toEqual({ email: 'mario@esempio.com', remember: true });
    });
  });

  it('requestOtp rifiuta un\'email non valida senza chiamare hub', async () => {
    const fetch = fakeFetch({});
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await expect(auth.requestOtp('non-una-email')).rejects.toMatchObject({ code: 'InvalidEmail' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('verifyOtp invia il tool, salva la sessione e carica /me', async () => {
    const storage = memoryStorageAdapter();
    const fetch = fakeFetch({
      'POST otp-request': () => json(200, { success: true }),
      'POST otp-verify': () => json(200, { user_id: 'u1', email: 'mario@esempio.com', session_token: 'tok', expires_at: 'x' }),
      'GET me?tool=voicenote': () => json(200, ME),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', tool: 'voicenote', storage, fetch });
    await auth.requestOtp('mario@esempio.com');
    await auth.verifyOtp('123456');

    const verifyBody = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(verifyBody).toEqual({ email: 'mario@esempio.com', otp_code: '123456', tool: 'voicenote' });
    const state = auth.getState();
    expect(state.status).toBe('authenticated');
    expect(state.token).toBe('tok');
    expect(state.user?.role).toBe('user');
    expect(state.user?.tools).toEqual(['voicenote']);
    expect(state.step).toBe('email');
    expect(storedSession(storage)?.token).toBe('tok');
  });

  it('un OTP sbagliato (401) non slogga una sessione e rilancia l\'errore', async () => {
    const fetch = fakeFetch({
      'POST otp-request': () => json(200, { success: true }),
      'POST otp-verify': () => json(401, { error: 'Codice non valido o scaduto.' }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.requestOtp('mario@esempio.com');

    const err = await auth.verifyOtp('000000').catch((e) => e);
    expect(err).toBeInstanceOf(HubAuthError);
    expect(err.status).toBe(401);
    expect(err.code).toBeNull();
    expect(err.message).toBe('Codice non valido o scaduto.');
    expect(auth.getState().step).toBe('otp');
    expect(auth.getState().loading).toBe(false);
  });

  it('403 ToolNotEnabled da otp-verify espone il codice', async () => {
    const fetch = fakeFetch({
      'POST otp-request': () => json(200, { success: true }),
      'POST otp-verify': () => json(403, { error: 'ToolNotEnabled', message: 'Tool non abilitato' }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.requestOtp('mario@esempio.com');
    await expect(auth.verifyOtp('123456')).rejects.toMatchObject({ status: 403, code: 'ToolNotEnabled' });
    expect(auth.getState().token).toBeNull();
  });

  it('risposta senza session_token è un errore', async () => {
    const fetch = fakeFetch({
      'POST otp-request': () => json(200, { success: true }),
      'POST otp-verify': () => json(200, { user_id: 'u1' }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch });
    await auth.requestOtp('mario@esempio.com');
    await expect(auth.verifyOtp('123456')).rejects.toMatchObject({ code: 'InvalidResponse' });
  });
});

describe('adoptSession (es. magic link)', () => {
  it('apre la sessione col token dato e completa il profilo da /me', async () => {
    const storage = memoryStorageAdapter();
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });

    await auth.adoptSession({ token: 'link-tok', user: { user_id: 'u1', email: 'mario@esempio.com' } });

    const state = auth.getState();
    expect(state.token).toBe('link-tok');
    expect(state.status).toBe('authenticated');
    expect(state.user?.role).toBe('user');
    expect(storedSession(storage, 'k')?.token).toBe('link-tok');
  });

  it('un profilo non ancora leggibile lascia comunque la sessione autenticata (offline)', async () => {
    const auth = createHubAuth({
      baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(),
      fetch: vi.fn(async () => { throw new TypeError('Failed to fetch'); }),
    });

    await auth.adoptSession({ token: 'link-tok', user: { user_id: 'u1' } });

    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().offline).toBe(true);
  });
});

describe('boot con sessione salvata', () => {
  const saved = () => {
    const storage = memoryStorageAdapter();
    storage.set('app:session', { v: 1, token: 'tok', user: { ...ME, role: 'admin' } });
    return storage;
  };

  it('il token è disponibile subito con uno storage sincrono', () => {
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage: saved(), fetch });
    expect(auth.getToken()).toBe('tok');
    expect(auth.getState().status).toBe('checking');
  });

  it('/me 200 aggiorna l\'utente', async () => {
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage: saved(), fetch });
    await flush();
    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().user?.role).toBe('user');
  });

  it('/me 401 slogga con avviso session_expired', async () => {
    const onLogout = vi.fn();
    const storage = saved();
    const fetch = fakeFetch({ 'GET me': () => json(401, { error: 'Unauthorized' }) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage, fetch, onLogout });
    await flush();
    expect(auth.getState().status).toBe('anonymous');
    expect(auth.getState().notice).toBe('session_expired');
    expect(storedSession(storage)).toBeNull();
    expect(onLogout).toHaveBeenCalledWith({ userId: 'u1', notice: 'session_expired' });
  });

  it('/me 403 TrialExpired slogga e revoca la sessione', async () => {
    const fetch = fakeFetch({
      'GET me': () => json(403, { error: 'TrialExpired', message: 'Periodo di prova terminato.' }),
      'POST logout': () => json(200, { success: true }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage: saved(), fetch });
    await flush();
    expect(auth.getState().notice).toBe('trial_expired');
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('logout'))).toBe(true);
  });

  it('rete assente: la sessione resta valida (offline)', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage: saved(), fetch });
    await flush();
    expect(auth.getState().status).toBe('authenticated');
    expect(auth.getState().offline).toBe(true);
    expect(auth.getState().user?.role).toBe('admin');
  });

  it('expires_at nel passato non slogga (sessione sliding)', async () => {
    const storage = memoryStorageAdapter();
    storage.set('app:session', { v: 1, token: 'tok', user: ME, expiresAt: '2000-01-01T00:00:00Z' });
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage, fetch });
    await flush();
    expect(auth.getState().status).toBe('authenticated');
  });

  it('senza sessione lo stato è anonymous', async () => {
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}) });
    await auth.ready;
    expect(auth.getState().status).toBe('anonymous');
  });

  it('storage asincrono (IndexedDB): la sessione arriva dopo ready', async () => {
    const data = new Map<string, unknown>([['k', { v: 1, token: 'tok', user: ME }]]);
    const storage: StorageAdapter = {
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => void data.set(key, value),
      remove: async (key) => void data.delete(key),
    };
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });
    expect(auth.getState().status).toBe('checking');
    await auth.ready;
    expect(auth.getToken()).toBe('tok');
  });
});

describe('migrazione dalle vecchie chiavi', () => {
  it('recupera il token dalla vecchia sessione e rimuove le chiavi legacy', async () => {
    const storage = memoryStorageAdapter();
    storage.set('sp_session', { userId: 'u1', token: 'old-tok', expiresAt: '2000-01-01' });
    storage.set('sp_user', { username: 'mario' });
    const fetch = fakeFetch({ 'GET me': () => json(200, ME) });
    const auth = createHubAuth({
      baseUrl: BASE, storageKey: 'sp:hub_session', legacyKeys: ['sp_session', 'sp_user'], storage, fetch,
    });
    expect(auth.getToken()).toBe('old-tok');
    await flush();
    expect(auth.getState().status).toBe('authenticated');
    expect(storage.get('sp_session')).toBeNull();
    expect(storage.get('sp_user')).toBeNull();
    expect(storedSession(storage, 'sp:hub_session')?.token).toBe('old-tok');
  });

  it('supporta la forma {token, user: {user_id}} e session_token', () => {
    const storage = memoryStorageAdapter();
    storage.set('old', { session_token: 'a', user_id: 'u1' });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'new', legacyKeys: ['old'], storage, fetch: fakeFetch({ 'GET me': () => json(200, ME) }) });
    expect(auth.getToken()).toBe('a');
  });

  it('una vecchia sessione senza token (carousel) porta al login', async () => {
    const storage = memoryStorageAdapter();
    storage.set('carosello:user_session', { email: 'a@b.it', userId: 'u1', role: 'admin' });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'new', legacyKeys: ['carosello:user_session'], storage, fetch: fakeFetch({}) });
    await auth.ready;
    expect(auth.getState().status).toBe('anonymous');
    expect(storage.get('carosello:user_session')).toBeNull();
  });
});

describe('logout e 401', () => {
  async function loggedIn(extraRoutes: Record<string, () => Response> = {}) {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const fetch = fakeFetch({ 'GET me': () => json(200, ME), ...extraRoutes });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });
    await flush();
    return { auth, fetch, storage };
  }

  it('logout revoca la sessione con il token catturato prima della pulizia', async () => {
    const { auth, fetch, storage } = await loggedIn({ 'POST logout': () => json(200, { success: true }) });
    auth.logout();
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith('logout'));
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer tok');
    expect(auth.getState().status).toBe('anonymous');
    expect(storage.get('k')).toBeNull();
  });

  it('authFetch aggiunge il Bearer e su 401 slogga', async () => {
    const { auth, fetch } = await loggedIn({ 'GET blogs/u1': () => json(401, { error: 'Unauthorized' }) });
    const res = await auth.authFetch('blogs/u1');
    expect(res.status).toBe(401);
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith('blogs/u1'));
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer tok');
    expect(auth.getState().notice).toBe('session_expired');
  });

  it('url() lascia invariati gli URL assoluti e risolve i relativi su hub', async () => {
    const { auth } = await loggedIn();
    expect(auth.url('https://altro.test/x')).toBe('https://altro.test/x');
    expect(auth.url('/me')).toBe(`${BASE}me`);
  });

  it("authFetch allega il Bearer a un URL assoluto sull'origine di hub", async () => {
    const { auth, fetch } = await loggedIn({ 'GET other': () => json(200, {}) });
    await auth.authFetch('https://hub.test/altro-percorso');
    const call = fetch.mock.calls.find(([u]) => String(u) === 'https://hub.test/altro-percorso');
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it("authFetch NON allega il Bearer a un URL di un'altra origine", async () => {
    const { auth, fetch } = await loggedIn();
    await auth.authFetch('https://altro.test/x');
    await auth.authFetch('http://hub.test/v1/me'); // stesso host ma schema diverso: altra origine
    const calls = fetch.mock.calls.filter(([u]) => /^https?:\/\/(altro\.test|hub\.test\/v1\/me$)/.test(String(u)) && !String(u).startsWith(BASE));
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('un 401 di una richiesta con un token vecchio viene ignorato', async () => {
    const { auth } = await loggedIn();
    auth.handleUnauthorized('token-precedente');
    expect(auth.getState().status).toBe('authenticated');
  });

  it('handleUnauthorized senza sessione non fa nulla', async () => {
    const onLogout = vi.fn();
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage: memoryStorageAdapter(), fetch: fakeFetch({}), onLogout });
    auth.handleUnauthorized();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('una risposta di /me arrivata dopo il logout viene ignorata', async () => {
    let resolveMe: (r: Response) => void = () => undefined;
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const fetch = fakeFetch({
      'GET me': () => new Promise<Response>((resolve) => { resolveMe = resolve; }),
      'POST logout': () => json(200, { success: true }),
    });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch });
    auth.logout();
    resolveMe(json(200, ME));
    await flush();
    expect(auth.getState().status).toBe('anonymous');
  });
});

describe('installAxiosInterceptors', () => {
  /** Istanza axios minima: registra gli interceptor per richiamarli nei test */
  function fakeAxios() {
    const handlers: { request?: (c: any) => any; rejected?: (e: any) => any } = {};
    return {
      handlers,
      interceptors: {
        request: { use: (fn: (c: any) => any) => { handlers.request = fn; return 1; }, eject: vi.fn() },
        response: { use: (_ok: any, ko: (e: any) => any) => { handlers.rejected = ko; return 2; }, eject: vi.fn() },
      },
    };
  }

  it('aggiunge il Bearer e slogga su 401 della sessione corrente', async () => {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch: fakeFetch({ 'GET me': () => json(200, ME) }) });
    await flush();
    const axios = fakeAxios();
    const uninstall = auth.installAxiosInterceptors(axios);

    const cfg = axios.handlers.request!({ baseURL: BASE, url: 'blogs/u1', headers: {} });
    expect(cfg.headers.Authorization).toBe('Bearer tok');

    await expect(axios.handlers.rejected!({ response: { status: 401 }, config: cfg })).rejects.toBeTruthy();
    expect(auth.getState().status).toBe('anonymous');

    uninstall();
    expect(axios.interceptors.request.eject).toHaveBeenCalledWith(1);
  });

  it('non sovrascrive un Authorization già impostato', async () => {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch: fakeFetch({ 'GET me': () => json(200, ME) }) });
    const axios = fakeAxios();
    auth.installAxiosInterceptors(axios);
    const cfg = axios.handlers.request!({ baseURL: BASE, url: 'x', headers: { Authorization: 'Bearer altro' } });
    expect(cfg.headers.Authorization).toBe('Bearer altro');
  });

  it('allega il Bearer solo se la richiesta risolta va a hub', async () => {
    const storage = memoryStorageAdapter();
    storage.set('k', { v: 1, token: 'tok', user: ME });
    const auth = createHubAuth({ baseUrl: BASE, storageKey: 'k', storage, fetch: fakeFetch({ 'GET me': () => json(200, ME) }) });
    const axios = fakeAxios();
    auth.installAxiosInterceptors(axios);
    const run = (cfg: Record<string, unknown>) => axios.handlers.request!({ headers: {}, ...cfg }).headers.Authorization;

    // baseURL di hub, anche con un percorso diverso da quello di baseUrl: stessa origine
    expect(run({ baseURL: 'https://hub.test/altro/v2', url: '/x' })).toBe('Bearer tok');
    // url assoluto di hub con baseURL altrove: axios ignora baseURL, vale l'url
    expect(run({ baseURL: 'https://altro.test/api', url: 'https://hub.test/me' })).toBe('Bearer tok');
    // baseURL altrove
    expect(run({ baseURL: 'https://altro.test/api', url: '/x' })).toBeUndefined();
    // url assoluto altrove con baseURL di hub
    expect(run({ baseURL: BASE, url: 'https://altro.test/x' })).toBeUndefined();
    // url protocol-relative: axios lo tratta come assoluto
    expect(run({ baseURL: BASE, url: '//altro.test/x' })).toBeUndefined();
    // nessun baseURL e url relativo: la richiesta va all'origine della pagina, non a hub
    expect(run({ url: '/x' })).toBeUndefined();
  });
});
