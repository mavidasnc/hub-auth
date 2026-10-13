/**
 * Test della sincronizzazione fra schede (BroadcastChannel) e del logout globale.
 *
 * Due client con la stessa storageKey simulano due schede dello stesso browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubAuth, memoryStorageAdapter, type StorageAdapter } from '../src/core/index.js';

const BASE = 'https://hub.test/v1/';
const ME = { user_id: 'u1', email: 'mario@esempio.com', username: 'mario', role: 'user', plan: 'pro',
             status: 'active', expires_at: null, tools: ['voicenote'] };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** BroadcastChannel finto: consegna ai soli altri canali con lo stesso nome, in modo asincrono */
const channels = new Map<string, Set<FakeChannel>>();
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add(this);
  }
  postMessage(data: unknown): void {
    for (const other of channels.get(this.name) ?? []) {
      if (other !== this) setTimeout(() => other.onmessage?.({ data } as MessageEvent), 0);
    }
  }
  close(): void {
    channels.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  channels.clear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** fetch finta con tracciamento delle chiamate; le rotte non previste rispondono 200 vuoto */
function makeFetch(routes: Record<string, () => Response | Promise<Response>> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input).replace(BASE, '')}`;
    return (routes[key] ?? (() => json(200, key === 'GET me' ? ME : {})))();
  });
}

/** Una "scheda": client con sessione già presente nello storage condiviso */
async function tab(storage: StorageAdapter, fetch = makeFetch(), extra: Record<string, unknown> = {}) {
  const onLogout = vi.fn();
  const auth = createHubAuth({ baseUrl: BASE, storageKey: 'app:session', storage, fetch, onLogout, ...extra });
  await flush();
  return { auth, fetch, onLogout };
}

function sharedSession(): StorageAdapter {
  const storage = memoryStorageAdapter();
  storage.set('app:session', { v: 1, token: 'tok', user: ME });
  return storage;
}

describe('logout fra schede', () => {
  it('il logout dell\'utente in una scheda fa uscire le altre, senza rimbalzo', async () => {
    const storage = sharedSession();
    const a = await tab(storage);
    const b = await tab(storage);
    expect(b.auth.getState().status).toBe('authenticated');

    a.auth.logout();
    await flush();

    expect(b.auth.getState().status).toBe('anonymous');
    // onLogout (pulizia dei dati locali dell'app) gira anche nella scheda che non ha cliccato
    expect(b.onLogout).toHaveBeenCalledTimes(1);
    expect(a.onLogout).toHaveBeenCalledTimes(1);
  });

  it('un logout con notice (es. sessione scaduta) resta locale', async () => {
    const storage = sharedSession();
    const a = await tab(storage);
    const b = await tab(storage);

    a.auth.forceLogout('session_expired');
    await flush();

    expect(b.auth.getState().status).toBe('authenticated');
    expect(b.onLogout).not.toHaveBeenCalled();
  });

  it('la scheda che riceve il logout revoca il proprio token', async () => {
    const storage = memoryStorageAdapter();
    storage.set('app:session', { v: 1, token: 'tok-b', user: ME });
    const b = await tab(storage);
    const a = await tab(sharedSession());

    a.auth.logout();
    await flush();

    const revoke = b.fetch.mock.calls.find(([u]) => String(u).endsWith('/logout'));
    expect(new Headers(revoke?.[1]?.headers).get('Authorization')).toBe('Bearer tok-b');
  });
});

describe('login fra schede', () => {
  it('una scheda senza sessione riprende quella creata in un\'altra (storage condiviso)', async () => {
    const storage = memoryStorageAdapter();
    const anon = await tab(storage);
    expect(anon.auth.getState().status).toBe('anonymous');

    // L'altra scheda completa il login: scrive la sessione e lo annuncia
    storage.set('app:session', { v: 1, token: 'nuovo', user: ME });
    const logged = await tab(storage);
    logged.auth.adoptSession({ token: 'nuovo', user: { user_id: 'u1', email: ME.email } });
    await flush();

    expect(anon.auth.getState().status).toBe('authenticated');
    expect(anon.auth.getToken()).toBe('nuovo');
  });

  it('con lo storage in memoria la scheda senza sessione prova il cookie SSO', async () => {
    const ssoFetch = makeFetch({ 'POST sso/session': () => json(200, { user_id: 'u1', email: ME.email, session_token: 'sso-tok' }) });
    // Prima scheda: nessuna sessione e SSO non disponibile all'avvio
    const failing = makeFetch({ 'POST sso/session': () => json(401, { error: 'Unauthorized' }) });
    const anon = await tab(memoryStorageAdapter(), failing, { sso: true });
    expect(anon.auth.getState().status).toBe('anonymous');

    // Ora il cookie SSO esiste: la seconda scheda fa il login e lo annuncia
    failing.mockImplementation(ssoFetch.getMockImplementation()!);
    const other = await tab(memoryStorageAdapter(), makeFetch(), { sso: true });
    other.auth.adoptSession({ token: 'altro', user: { user_id: 'u1' } });
    await flush();

    expect(anon.auth.getToken()).toBe('sso-tok');
  });

  it('una scheda già autenticata ignora il login altrui', async () => {
    const storage = sharedSession();
    const a = await tab(storage);
    const other = await tab(memoryStorageAdapter());
    other.auth.adoptSession({ token: 'altro', user: { user_id: 'u2' } });
    await flush();
    expect(a.auth.getToken()).toBe('tok');
  });
});

describe('senza BroadcastChannel', () => {
  it('il client funziona comunque', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const a = await tab(sharedSession());
    expect(a.auth.getState().status).toBe('authenticated');
    expect(() => a.auth.logout()).not.toThrow();
  });
});

describe('logout globale', () => {
  it('se la richiesta con credenziali fallisce, revoca il token senza credenziali e avvisa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const u = String(input);
      if (u.endsWith('logout?scope=global')) throw new TypeError('Failed to fetch');
      if (u.endsWith('/logout')) return json(200, { success: true });
      return json(200, ME);
    });
    const a = await tab(sharedSession(), fetch as never, { sso: true });

    a.auth.logout();
    await flush();

    const urls = fetch.mock.calls.map(([u, i]) => `${(i as RequestInit | undefined)?.method ?? 'GET'} ${String(u).replace(BASE, '')}`);
    expect(urls).toContain('POST logout?scope=global');
    expect(urls).toContain('POST logout');
    const retry = fetch.mock.calls.find(([u]) => String(u).endsWith('/logout'));
    expect((retry?.[1] as RequestInit).credentials).toBeUndefined();
    expect(new Headers((retry?.[1] as RequestInit).headers).get('Authorization')).toBe('Bearer tok');
    expect(warn).toHaveBeenCalled();
  });
});
