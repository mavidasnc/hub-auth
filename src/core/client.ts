/**
 * Client di autenticazione OTP verso hub.
 *
 * Unica fonte di verità della sessione applicativa emessa da POST /otp-verify:
 * token, utente, flusso di login (email → codice) e avvisi di logout forzato.
 * Non dipende da React: il binding sta in `@mavida/hub-auth/react`.
 *
 * Regole incorporate (valide per tutti i progetti):
 * - `expires_at` restituito da otp-verify NON decide il logout: la sessione
 *   hub è sliding (rinnovata ad ogni uso), la validità la stabilisce solo hub
 * - al boot la sessione salvata viene validata con GET /me: 401 → logout,
 *   403 ToolNotEnabled/TrialExpired → logout con avviso, rete assente →
 *   la sessione resta valida (offline) e si riprova al ritorno della rete
 * - un 401 porta al logout solo se c'è una sessione attiva ed è quella usata
 *   dalla richiesta: un OTP sbagliato o una risposta arrivata dopo un nuovo
 *   login non sloggano nessuno
 * - il logout cattura il token PRIMA della pulizia locale, poi lo revoca su hub
 */

import { errorFromBody, HubAuthError, networkError, type HubErrorBody } from './errors.js';
import { localStorageAdapter, type StorageAdapter } from './storage.js';

/**
 * Stato della sessione
 * - checking: sessione salvata presente, verifica con GET /me in corso
 * - anonymous: nessuna sessione, va mostrato il login
 * - authenticated: sessione valida (o hub non raggiungibile: vedi `offline`)
 */
export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

/**
 * Motivo di un logout forzato, da mostrare nella schermata di login
 * - session_expired: 401 su una chiamata autenticata
 * - tool_not_enabled: 403 ToolNotEnabled (tool non abilitato per l'account)
 * - trial_expired: 403 TrialExpired (scadenza dell'account superata)
 */
export type AuthNotice = 'session_expired' | 'tool_not_enabled' | 'trial_expired';

/** Utente della sessione, come restituito da GET /me */
export interface HubUser {
  user_id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  plan: string | null;
  status: string | null;
  /** Scadenza dell'account (prova o accesso a tempo), non della sessione */
  expires_at: string | null;
  /** Chiavi dei tool effettivi dell'utente */
  tools: string[];
}

/** Stato completo osservabile del client */
export interface AuthState {
  status: AuthStatus;
  user: HubUser | null;
  token: string | null;
  notice: AuthNotice | null;
  /** Step del flusso di login */
  step: 'email' | 'otp';
  /** Email a cui è stato chiesto il codice (step 'otp') */
  pendingEmail: string;
  /** Timestamp (ms) dell'ultima richiesta di codice riuscita, per il cooldown del reinvio */
  otpRequestedAt: number | null;
  /** Richiesta di login in corso (otp-request / otp-verify) */
  loading: boolean;
  /** true se l'ultima verifica della sessione non ha raggiunto hub */
  offline: boolean;
}

/** Configurazione del client */
export interface HubAuthConfig {
  /** Base URL di hub, con o senza slash finale (es. https://chat.mavida.com/wp-draft-generator/v1/) */
  baseUrl: string;
  /** Chiave con cui salvare la sessione (es. 'wandly:hub_session') */
  storageKey: string;
  /** Chiave del tool (generations_tools.key): inviata a otp-verify e a GET /me */
  tool?: string;
  /** Storage della sessione (default: localStorage) */
  storage?: StorageAdapter;
  /**
   * Chiavi della vecchia sessione del progetto, lette una sola volta se manca
   * quella nuova: il token viene recuperato e validato con /me, così la
   * migrazione alla libreria non slogga gli utenti. Vengono poi rimosse.
   */
  legacyKeys?: string[];
  /** Implementazione di fetch (default: globalThis.fetch) */
  fetch?: typeof fetch;
  /** Callback dopo ogni logout (esplicito o forzato), per la pulizia dei dati del progetto */
  onLogout?: (info: { userId: string | null; notice: AuthNotice | null }) => void;
}

/** Istanza axios minima usata da installAxiosInterceptors (nessuna dipendenza da axios) */
export interface AxiosLike {
  interceptors: {
    request: { use(onFulfilled: (config: any) => any): number; eject(id: number): void };
    response: {
      use(onFulfilled: (response: any) => any, onRejected: (error: any) => any): number;
      eject(id: number): void;
    };
  };
}

/** API pubblica del client */
export interface HubAuthClient {
  /** Stato corrente (riferimento stabile finché non cambia) */
  getState(): AuthState;
  /** Registra un listener sui cambi di stato; restituisce la funzione di rimozione */
  subscribe(listener: () => void): () => void;
  /** Risolta quando la sessione salvata è stata letta dallo storage */
  ready: Promise<void>;
  /** Token corrente (null se non autenticato) */
  getToken(): string | null;
  /** URL assoluto di un percorso relativo alla base di hub (gli URL assoluti restano invariati) */
  url(path: string): string;
  /** Richiede l'invio del codice OTP e passa allo step 'otp' (lancia HubAuthError) */
  requestOtp(email: string): Promise<void>;
  /** Verifica il codice OTP e apre la sessione (lancia HubAuthError) */
  verifyOtp(code: string): Promise<void>;
  /** Torna allo step email ("cambia email") */
  resetToEmail(): void;
  /** Ricarica utente e tool da GET /me */
  refresh(): Promise<void>;
  /** Logout esplicito: pulizia locale e revoca della sessione su hub */
  logout(notice?: AuthNotice): void;
  /** Pulizia solo locale della sessione */
  forceLogout(notice?: AuthNotice): void;
  /**
   * Da chiamare su un 401 ricevuto da un client HTTP del progetto.
   * @param usedToken - token inviato dalla richiesta: se diverso da quello corrente il 401 è ignorato
   */
  handleUnauthorized(usedToken?: string | null): void;
  /** Header Authorization della sessione corrente (oggetto vuoto se non autenticato) */
  authHeaders(): Record<string, string>;
  /** fetch autenticata: aggiunge il Bearer e gestisce il 401 */
  authFetch(path: string, init?: RequestInit): Promise<Response>;
  /** Aggancia Bearer e gestione del 401 a un'istanza axios; restituisce la funzione di sgancio */
  installAxiosInterceptors(instance: AxiosLike): () => void;
}

/** Sessione salvata nello storage */
interface StoredSession {
  v: 1;
  token: string;
  user: HubUser | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** true se il valore è una Promise (o thenable) */
function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === 'function';
}

/** Estrae il token da un header Authorization "Bearer <token>" */
function bearerOf(header: unknown): string | null {
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Normalizza il body di GET /me in HubUser */
function userFromMe(body: Record<string, unknown>): HubUser {
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    user_id: String(body.user_id ?? ''),
    email: str(body.email),
    username: str(body.username),
    role: str(body.role),
    plan: str(body.plan),
    status: str(body.status),
    expires_at: str(body.expires_at),
    tools: Array.isArray(body.tools) ? body.tools.filter((t): t is string => typeof t === 'string') : [],
  };
}

/** Utente parziale (solo id ed email), in attesa della risposta di /me */
function partialUser(userId: string, email: string | null): HubUser {
  return { user_id: userId, email, username: null, role: null, plan: null, status: null, expires_at: null, tools: [] };
}

/**
 * Estrae token, user_id ed email da una vecchia sessione di progetto.
 * Copre le forme usate finora: {token, userId, email}, {session_token, user_id},
 * {token, user: {user_id, email}}.
 */
function sessionFromLegacy(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, any>;
  const token = obj.token ?? obj.session_token ?? obj.sessionToken;
  if (typeof token !== 'string' || !token) return null;
  const userId = obj.userId ?? obj.user_id ?? obj.user?.user_id ?? obj.user?.id ?? '';
  const email = obj.email ?? obj.user?.email ?? null;
  return { v: 1, token, user: partialUser(String(userId), typeof email === 'string' ? email : null) };
}

/** Valida una sessione letta dallo storage nel formato della libreria */
function sessionFromStorage(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<StoredSession>;
  return obj.v === 1 && typeof obj.token === 'string' && obj.token ? (obj as StoredSession) : null;
}

/**
 * Crea il client di autenticazione.
 *
 * Va creato una sola volta per applicazione (tipicamente in src/auth.js) e
 * condiviso da provider React e moduli di rete.
 */
export function createHubAuth(config: HubAuthConfig): HubAuthClient {
  const storage = config.storage ?? localStorageAdapter;
  const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
  // fetch risolta a ogni chiamata: i test (e gli eventuali polyfill) possono sostituirla dopo la creazione
  const doFetch: typeof fetch = (...args) => (config.fetch ?? globalThis.fetch)(...args);

  let state: AuthState = {
    status: 'checking',
    user: null,
    token: null,
    notice: null,
    step: 'email',
    pendingEmail: '',
    otpRequestedAt: null,
    loading: false,
    offline: false,
  };
  const listeners = new Set<() => void>();
  let onlineListenerAttached = false;

  // ── Stato ──────────────────────────────────────────────────────────────────

  /** Aggiorna lo stato (nuovo riferimento) e notifica i listener */
  function set(patch: Partial<AuthState>): void {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  /** Salva la sessione corrente nello storage (best effort) */
  function persist(): void {
    if (!state.token) return;
    const session: StoredSession = { v: 1, token: state.token, user: state.user };
    try {
      const result = storage.set(config.storageKey, session);
      if (isPromise(result)) result.catch((err) => console.warn('[hub-auth] salvataggio sessione fallito:', err));
    } catch (err) {
      console.warn('[hub-auth] salvataggio sessione fallito:', err);
    }
  }

  /** Rimuove una chiave dallo storage (best effort) */
  function removeKey(key: string): void {
    try {
      const result = storage.remove(key);
      if (isPromise(result)) result.catch(() => undefined);
    } catch {
      // Storage non accessibile: niente da rimuovere
    }
  }

  // ── Rete ───────────────────────────────────────────────────────────────────

  function url(path: string): string {
    return /^https?:\/\//i.test(path) ? path : `${base}${path.replace(/^\/+/, '')}`;
  }

  /** POST JSON su un endpoint pubblico di login; lancia HubAuthError sugli errori */
  async function publicPost<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw networkError(err);
    }
    const data = (await res.json().catch(() => null)) as (T & HubErrorBody) | null;
    if (!res.ok) throw errorFromBody(res.status, data);
    return data as T;
  }

  // ── Sessione ───────────────────────────────────────────────────────────────

  /** Apre la sessione in memoria e la persiste */
  function openSession(token: string, user: HubUser | null): void {
    set({ token, user, status: 'checking', notice: null, offline: false });
    persist();
  }

  function forceLogout(notice?: AuthNotice): void {
    const userId = state.user?.user_id || null;
    set({
      status: 'anonymous',
      user: null,
      token: null,
      notice: notice ?? null,
      step: 'email',
      pendingEmail: '',
      otpRequestedAt: null,
      loading: false,
      offline: false,
    });
    removeKey(config.storageKey);
    try {
      config.onLogout?.({ userId, notice: notice ?? null });
    } catch (err) {
      console.error('[hub-auth] onLogout ha lanciato un errore:', err);
    }
  }

  function logout(notice?: AuthNotice): void {
    // Il token va catturato prima della pulizia locale per poterlo revocare
    const token = state.token;
    forceLogout(notice);
    if (token) {
      doFetch(url('logout'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        .catch(() => undefined);
    }
  }

  function handleUnauthorized(usedToken?: string | null): void {
    if (!state.token) return;
    if (usedToken && usedToken !== state.token) return;
    forceLogout('session_expired');
  }

  /** Al ritorno della rete riprova la verifica della sessione (un solo listener) */
  function retryWhenOnline(): void {
    if (onlineListenerAttached || typeof window === 'undefined') return;
    onlineListenerAttached = true;
    window.addEventListener('online', () => {
      onlineListenerAttached = false;
      void refresh();
    }, { once: true });
  }

  async function refresh(): Promise<void> {
    const token = state.token;
    if (!token) return;

    const query = config.tool ? `?tool=${encodeURIComponent(config.tool)}` : '';
    let res: Response;
    try {
      res = await doFetch(url(`me${query}`), { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Rete assente: la sessione salvata resta valida, si riprova più tardi
      if (state.token === token) {
        set({ status: 'authenticated', offline: true });
        retryWhenOnline();
      }
      return;
    }

    // Logout o nuovo login avvenuti durante la richiesta: risposta non più pertinente
    if (state.token !== token) return;

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (res.ok && body) {
      set({ user: userFromMe(body), status: 'authenticated', offline: false });
      persist();
      return;
    }
    if (res.status === 401) {
      forceLogout('session_expired');
      return;
    }
    const error = errorFromBody(res.status, body as HubErrorBody | null);
    if (error.code === 'ToolNotEnabled') {
      logout('tool_not_enabled');
      return;
    }
    if (error.code === 'TrialExpired') {
      logout('trial_expired');
      return;
    }
    // 5xx o risposta inattesa: come per la rete assente, si prosegue con la sessione salvata
    console.warn('[hub-auth] GET /me non disponibile:', error.message);
    set({ status: 'authenticated', offline: true });
  }

  async function requestOtp(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      throw new HubAuthError('Indirizzo email non valido.', 400, 'InvalidEmail');
    }
    set({ loading: true, notice: null });
    try {
      await publicPost('otp-request', { email: normalized });
      set({ step: 'otp', pendingEmail: normalized, otpRequestedAt: Date.now() });
    } finally {
      set({ loading: false });
    }
  }

  async function verifyOtp(code: string): Promise<void> {
    const otp = code.trim();
    if (!/^\d{6}$/.test(otp)) {
      throw new HubAuthError('Il codice deve essere di 6 cifre.', 400, 'InvalidCode');
    }
    const email = state.pendingEmail;
    set({ loading: true, notice: null });
    try {
      const body: Record<string, string> = { email, otp_code: otp };
      if (config.tool) body.tool = config.tool;
      const data = await publicPost<{ user_id?: string; email?: string; session_token?: string }>('otp-verify', body);
      if (!data?.session_token || !data.user_id) {
        throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
      }
      openSession(data.session_token, partialUser(data.user_id, data.email ?? email));
      set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
      // Profilo, ruolo e tool arrivano da /me (con le stesse regole del boot)
      await refresh();
    } finally {
      set({ loading: false });
    }
  }

  // ── Integrazione con i client HTTP dei progetti ────────────────────────────

  function authHeaders(): Record<string, string> {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
  }

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (state.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${state.token}`);
    }
    const res = await doFetch(url(path), { ...init, headers });
    if (res.status === 401) handleUnauthorized(bearerOf(headers.get('Authorization')));
    return res;
  }

  function installAxiosInterceptors(instance: AxiosLike): () => void {
    /** Legge un header da AxiosHeaders (axios 1.x) o da un oggetto semplice */
    const readHeader = (headers: any, name: string): unknown =>
      typeof headers?.get === 'function' ? headers.get(name) : headers?.[name];

    const requestId = instance.interceptors.request.use((cfg) => {
      if (!state.token) return cfg;
      cfg.headers = cfg.headers ?? {};
      if (!readHeader(cfg.headers, 'Authorization')) {
        if (typeof cfg.headers.set === 'function') cfg.headers.set('Authorization', `Bearer ${state.token}`);
        else cfg.headers.Authorization = `Bearer ${state.token}`;
      }
      return cfg;
    });
    const responseId = instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          handleUnauthorized(bearerOf(readHeader(error.config?.headers, 'Authorization')));
        }
        return Promise.reject(error);
      },
    );
    return () => {
      instance.interceptors.request.eject(requestId);
      instance.interceptors.response.eject(responseId);
    };
  }

  // ── Idratazione iniziale ───────────────────────────────────────────────────

  /** Applica la sessione letta dallo storage (o nessuna) e avvia la verifica */
  function boot(session: StoredSession | null, fromLegacy: boolean): void {
    if (!session) {
      set({ status: 'anonymous' });
      return;
    }
    openSession(session.token, session.user);
    if (fromLegacy) persist();
    void refresh();
  }

  /** Cerca una vecchia sessione tra le legacyKeys, poi le rimuove tutte */
  function fromLegacyValues(values: unknown[]): StoredSession | null {
    const found = values.map(sessionFromLegacy).find((s) => s !== null) ?? null;
    (config.legacyKeys ?? []).forEach(removeKey);
    return found;
  }

  function hydrate(): void | Promise<void> {
    const legacyKeys = config.legacyKeys ?? [];

    const afterMain = (raw: unknown): void | Promise<void> => {
      const session = sessionFromStorage(raw);
      if (session || legacyKeys.length === 0) return boot(session, false);
      const values = legacyKeys.map((key) => storage.get(key));
      if (values.some(isPromise)) {
        return Promise.all(values).then((resolved) => boot(fromLegacyValues(resolved), true));
      }
      boot(fromLegacyValues(values), true);
    };

    // Con uno storage sincrono (localStorage) il token è disponibile subito,
    // prima che i moduli di rete del progetto facciano la prima chiamata
    const main = storage.get(config.storageKey);
    return isPromise(main) ? main.then(afterMain) : afterMain(main);
  }

  let ready: Promise<void>;
  try {
    const result = hydrate();
    ready = isPromise<void>(result) ? result.catch(() => boot(null, false)) : Promise.resolve();
  } catch {
    boot(null, false);
    ready = Promise.resolve();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    ready,
    getToken: () => state.token,
    url,
    requestOtp,
    verifyOtp,
    resetToEmail: () => set({ step: 'email', pendingEmail: '', otpRequestedAt: null }),
    refresh,
    logout,
    forceLogout,
    handleUnauthorized,
    authHeaders,
    authFetch,
    installAxiosInterceptors,
  };
}
