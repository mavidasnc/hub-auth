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
 *
 * Dalla 1.2.0:
 * - SSO (opzione `sso`): hub imposta un cookie host-only al login; un'app aperta
 *   senza sessione locale lo scambia con una propria sessione (POST /sso/session)
 * - magic link (opzione `magicLink`, attiva di default): il link dell'email OTP
 *   porta il token nel fragment (#hub_otp=...); l'app lo toglie subito dall'URL e
 *   lo usa solo dopo la conferma esplicita dell'utente (verifyLink)
 *
 * Dalla 1.3.0:
 * - configurazione pubblica del login (GET /auth/tool-config, `loadToolConfig`):
 *   pannello descrittivo del tool e disponibilità della registrazione
 * - registrazione (`startRegister` / `register`): nome utente, email e consenso
 *   privacy; l'esito dipende dalle impostazioni di hub: 'pending' (account da
 *   approvare, step 'registered') oppure 'active' (codice OTP già inviato, step 'otp')
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
 * - link_invalid: il magic link dell'email è sconosciuto, scaduto o già usato
 */
export type AuthNotice = 'session_expired' | 'tool_not_enabled' | 'trial_expired' | 'link_invalid';

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

/** Step del flusso di login */
export type AuthStep = 'email' | 'otp' | 'link' | 'register' | 'registered';

/**
 * Configurazione pubblica della schermata di login (GET /auth/tool-config)
 * - tool: etichetta, descrizione e avviso del tool (null se `tool` non è
 *   impostato o hub non lo conosce)
 * - signup_enabled: hub offre la registrazione per questo tool
 * - privacy: testo, versione e formato ('markdown' | 'text') dell'informativa
 *   (solo se la registrazione è offerta)
 */
export interface ToolConfig {
  tool: {
    key: string;
    label: string | null;
    description: string | null;
    login_notice: string | null;
  } | null;
  signup_enabled: boolean;
  privacy: { text: string; version: string; format?: 'markdown' | 'text' } | null;
}

/** Dati del form di registrazione */
export interface RegisterData {
  username: string;
  email: string;
  /** Consenso all'informativa privacy: deve essere true */
  privacyAccepted: boolean;
}

/** Stato completo osservabile del client */
export interface AuthState {
  status: AuthStatus;
  user: HubUser | null;
  token: string | null;
  notice: AuthNotice | null;
  /**
   * Step del flusso di login: 'link' = aperto un magic link (in attesa della
   * conferma), 'register' = form di registrazione, 'registered' = registrazione
   * ricevuta in attesa di approvazione
   */
  step: AuthStep;
  /** Configurazione pubblica del login, null finché non caricata (o se hub non risponde) */
  toolConfig: ToolConfig | null;
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
  /** Base URL di hub, con o senza slash finale (es. https://hub.mavida.com/api/v1/) */
  baseUrl: string;
  /** Chiave con cui salvare la sessione (es. 'wandly:hub_session') */
  storageKey: string;
  /** Chiave del tool (generations_tools.key): inviata a otp-verify e a GET /me */
  tool?: string;
  /**
   * SSO a cookie tra le app (default: spento). Con `true`: al login hub imposta
   * il cookie SSO, all'avvio senza sessione locale si tenta lo scambio del
   * cookie e `logout()` è globale (esce da tutte le app) se non indicato
   * diversamente. Richiede che l'origine dell'app sia in SSO_ALLOWED_ORIGINS su
   * hub e che baseUrl punti all'host canonico di hub. Se la CORS con credenziali
   * non è configurata il login ripiega da solo sul flusso senza cookie.
   */
  sso?: boolean;
  /**
   * Magic link dell'email OTP (default: attivo). Con `false` il client non lo
   * richiede a hub e ignora `#hub_otp=` nell'URL: da usare solo se il progetto
   * ha una UI di login propria che non gestisce lo step 'link'.
   */
  magicLink?: boolean;
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
  /** Chiave del tool con cui è stato creato il client (`tool` di createHubAuth), se indicata (dalla 1.8.0) */
  readonly tool?: string;
  /** Token corrente (null se non autenticato) */
  getToken(): string | null;
  /** URL assoluto di un percorso relativo alla base di hub (gli URL assoluti restano invariati) */
  url(path: string): string;
  /** Richiede l'invio del codice OTP e passa allo step 'otp' (lancia HubAuthError) */
  requestOtp(email: string): Promise<void>;
  /** Verifica il codice OTP e apre la sessione (lancia HubAuthError) */
  verifyOtp(code: string): Promise<void>;
  /**
   * Conferma l'accesso con il magic link aperto (step 'link') e apre la sessione.
   * Un link sconosciuto, scaduto o già usato non lancia: porta allo step email
   * con la notice 'link_invalid'. Gli altri errori (rete, 429, 5xx) vengono
   * lanciati e il link resta utilizzabile per un nuovo tentativo.
   */
  verifyLink(): Promise<void>;
  /** Scarta il magic link e torna allo step email ("usa il codice") */
  cancelLink(): void;
  /**
   * Adotta una sessione ottenuta da un meccanismo diverso da otp-verify (es.
   * lo scambio di un magic link): stesso trattamento di un login OTP
   * riuscito, incluso il refresh da GET /me.
   */
  adoptSession(session: { token: string; user: Partial<HubUser> & { user_id: string } }): Promise<void>;
  /** Torna allo step email ("cambia email", "ho già un account") */
  resetToEmail(): void;
  /**
   * Carica la configurazione pubblica del login (GET /auth/tool-config) in
   * `toolConfig`. Non lancia mai: se hub non risponde la schermata resta
   * senza pannello e senza registrazione. Con `force` ricarica anche se già presente.
   */
  loadToolConfig(force?: boolean): Promise<void>;
  /** Apre il form di registrazione (solo se hub la offre per questo tool) */
  startRegister(): void;
  /**
   * Registra un nuovo utente (POST /signup). Con account da approvare passa
   * allo step 'registered', con account attivo a 'otp' (il codice è già stato
   * inviato). Lancia HubAuthError (InvalidUsername, InvalidEmail,
   * PrivacyNotAccepted, SignupDisabled, PrivacyVersionMismatch, 429, rete...).
   */
  register(data: RegisterData): Promise<void>;
  /** Ricarica utente e tool da GET /me */
  refresh(): Promise<void>;
  /**
   * Logout: pulizia locale e revoca della sessione su hub.
   * Con `sso` attivo il logout richiesto dall'utente (senza `notice`) è globale
   * di default: revoca anche la sessione SSO, altrimenti alla prossima apertura
   * l'app rientrerebbe da sola. I logout con `notice` (tool non abilitato, prova
   * scaduta) restano locali. `{ global: false }` forza il solo logout locale.
   */
  logout(notice?: AuthNotice, options?: { global?: boolean }): void;
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

/** Risposta di otp-verify, otp-verify-link e sso/session */
interface LoginResponse {
  user_id?: string;
  email?: string;
  session_token?: string;
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

/** Valida il body di GET /auth/tool-config; null se la forma non è quella attesa */
function toolConfigFromBody(body: unknown): ToolConfig | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, any>;
  if (typeof obj.signup_enabled !== 'boolean') return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const tool = obj.tool && typeof obj.tool === 'object' && typeof obj.tool.key === 'string'
    ? {
      key: obj.tool.key as string,
      label: str(obj.tool.label),
      description: str(obj.tool.description),
      login_notice: str(obj.tool.login_notice),
    }
    : null;
  const privacy = obj.privacy && typeof obj.privacy.text === 'string' && typeof obj.privacy.version === 'string'
    ? {
      text: obj.privacy.text as string,
      version: obj.privacy.version as string,
      // Hub più vecchi non inviano il formato: il campo manca e vale testo semplice
      ...(obj.privacy.format === 'markdown' ? { format: 'markdown' as const } : {}),
    }
    : null;
  return { tool, signup_enabled: obj.signup_enabled, privacy };
}

/** Parametro del fragment che porta il token del magic link (#hub_otp=...) */
const LINK_PARAM = 'hub_otp';

/** Forma attesa del token del magic link (secrets.token_urlsafe(32) lato hub) */
const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/**
 * Legge il token del magic link dal fragment dell'URL e lo RIMUOVE subito
 * (history.replaceState): così non resta nella barra, nella cronologia né in
 * una schermata condivisa. Il fragment non viene mai inviato a nessun server.
 *
 * @returns il token se presente e ben formato, altrimenti null
 */
function takeLinkFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get(LINK_PARAM);
  if (token === null) return null;

  params.delete(LINK_PARAM);
  const rest = params.toString();
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}${rest ? `#${rest}` : ''}`);
  } catch {
    // history non disponibile: il token resta nell'URL ma non viene comunque inviato a nessuno
  }
  return LINK_TOKEN_RE.test(token) ? token : null;
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
  // Il magic link è attivo di default; il token vive solo in memoria (mai nello stato osservabile)
  let linkToken: string | null = config.magicLink === false ? null : takeLinkFromUrl();

  let state: AuthState = {
    status: 'checking',
    user: null,
    token: null,
    notice: null,
    step: 'email',
    toolConfig: null,
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

  /**
   * POST JSON su un endpoint pubblico di login; lancia HubAuthError sugli errori.
   * @param credentials - invia/riceve i cookie (serve a hub per impostare il cookie SSO)
   */
  async function publicPost<T>(path: string, body: unknown, credentials = false): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(credentials ? { credentials: 'include' as const } : {}),
      });
    } catch (err) {
      throw networkError(err);
    }
    const data = (await res.json().catch(() => null)) as (T & HubErrorBody) | null;
    if (!res.ok) throw errorFromBody(res.status, data);
    return data as T;
  }

  /**
   * POST di un endpoint che apre la sessione (otp-verify, otp-verify-link).
   * Con `sso` chiede anche il cookie SSO. Se l'origine dell'app non è ancora in
   * SSO_ALLOWED_ORIGINS di hub, il browser blocca la richiesta con credenziali
   * già al preflight (errore di rete, nulla è stato inviato): in quel caso si
   * ripete una volta senza SSO, così una configurazione incompleta non impedisce il login.
   */
  async function loginPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (!config.sso) return publicPost<T>(path, body);
    try {
      return await publicPost<T>(path, { ...body, sso: true }, true);
    } catch (err) {
      if (!(err instanceof HubAuthError) || err.code !== 'NetworkError') throw err;
      return publicPost<T>(path, body);
    }
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

  function logout(notice?: AuthNotice, options?: { global?: boolean }): void {
    // Un handler passato direttamente a onClick riceve un evento: non è una notice
    const reason = typeof notice === 'string' ? notice : undefined;
    // Globale solo con SSO attivo; di default lo è il logout dell'utente, non quello con notice
    const global = !!config.sso && (options?.global ?? !reason);
    // Il token va catturato prima della pulizia locale per poterlo revocare
    const token = state.token;
    forceLogout(reason);
    if (token) {
      doFetch(url(global ? 'logout?scope=global' : 'logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        // Il cookie SSO viaggia (e viene cancellato) solo con le credenziali
        ...(global ? { credentials: 'include' as const } : {}),
      }).catch(() => undefined);
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
      // link: true = questo client sa gestire il magic link (hub lo include nell'email)
      await publicPost('otp-request', config.magicLink === false ? { email: normalized } : { email: normalized, link: true });
      set({ step: 'otp', pendingEmail: normalized, otpRequestedAt: Date.now() });
      pollSsoWhileWaiting();
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
      const data = await loginPost<LoginResponse>('otp-verify', body);
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

  async function verifyLink(): Promise<void> {
    const token = linkToken;
    if (!token) throw new HubAuthError('Link di accesso non valido.', 400, 'InvalidLink');
    set({ loading: true, notice: null });
    try {
      const body: Record<string, string> = { token };
      if (config.tool) body.tool = config.tool;
      const data = await loginPost<LoginResponse>('otp-verify-link', body);
      if (!data?.session_token || !data.user_id) {
        throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
      }
      linkToken = null;
      openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
      set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
      await refresh();
    } catch (err) {
      // Link morto (401: sconosciuto, scaduto, già usato) o accesso negato: inutile
      // riprovare, si torna al login con l'avviso. Rete, 429 e 5xx vengono lanciati
      // e il link resta valido per un nuovo tentativo.
      if (err instanceof HubAuthError) {
        const notice: AuthNotice | null =
          err.code === 'ToolNotEnabled' ? 'tool_not_enabled'
            : err.code === 'TrialExpired' ? 'trial_expired'
              : err.status === 401 ? 'link_invalid'
                : null;
        if (notice) {
          linkToken = null;
          set({ step: 'email', notice });
          return;
        }
      }
      throw err;
    } finally {
      set({ loading: false });
    }
  }

  function cancelLink(): void {
    linkToken = null;
    set({ step: 'email', notice: null });
  }

  // ── Configurazione pubblica e registrazione ────────────────────────────────

  /** Richiesta in corso di GET /auth/tool-config: evita chiamate doppie */
  let toolConfigRequest: Promise<void> | null = null;

  async function fetchToolConfig(): Promise<void> {
    try {
      const query = config.tool ? `?tool=${encodeURIComponent(config.tool)}` : '';
      const res = await doFetch(url(`auth/tool-config${query}`));
      if (!res.ok) return;
      const parsed = toolConfigFromBody(await res.json().catch(() => null));
      if (parsed) set({ toolConfig: parsed });
    } catch {
      // hub non raggiungibile o non aggiornato: login senza pannello né registrazione
    }
  }

  function loadToolConfig(force = false): Promise<void> {
    if (state.toolConfig && !force) return Promise.resolve();
    if (!toolConfigRequest) {
      // .finally gira dopo l'assegnazione: la richiesta si libera sempre, anche su errore
      toolConfigRequest = fetchToolConfig().finally(() => { toolConfigRequest = null; });
    }
    return toolConfigRequest;
  }

  function startRegister(): void {
    if (!state.toolConfig?.signup_enabled) return;
    set({ step: 'register', notice: null });
  }

  async function register(data: RegisterData): Promise<void> {
    const privacy = state.toolConfig?.privacy;
    if (!state.toolConfig?.signup_enabled || !privacy) {
      throw new HubAuthError('La registrazione non è disponibile.', 403, 'SignupDisabled');
    }
    const username = data.username.trim();
    const email = data.email.trim().toLowerCase();
    if (username.length < 2) {
      throw new HubAuthError('Inserisci un nome utente di almeno 2 caratteri.', 400, 'InvalidUsername');
    }
    if (!EMAIL_RE.test(email)) {
      throw new HubAuthError('Indirizzo email non valido.', 400, 'InvalidEmail');
    }
    if (!data.privacyAccepted) {
      throw new HubAuthError("È necessario accettare l'informativa privacy.", 400, 'PrivacyNotAccepted');
    }

    set({ loading: true, notice: null });
    try {
      const body: Record<string, unknown> = {
        username, email, privacy_accepted: true, privacy_version: privacy.version,
      };
      if (config.tool) body.tool = config.tool;
      const result = await publicPost<{ status?: string }>('signup', body);
      if (result?.status === 'active') {
        // Account attivo subito: hub ha già inviato il codice, si prosegue come un login
        set({ step: 'otp', pendingEmail: email, otpRequestedAt: Date.now() });
        pollSsoWhileWaiting();
      } else {
        set({ step: 'registered', pendingEmail: email });
      }
    } catch (err) {
      // Testo privacy cambiato o registrazione chiusa nel frattempo: si riallinea
      // la configurazione, così il form mostra subito il testo/stato corretto
      if (err instanceof HubAuthError && (err.code === 'PrivacyVersionMismatch' || err.code === 'SignupDisabled')) {
        void loadToolConfig(true);
      }
      throw err;
    } finally {
      set({ loading: false });
    }
  }

  // ── SSO ────────────────────────────────────────────────────────────────────

  /**
   * Scambia il cookie SSO con una sessione di questa app (POST /sso/session).
   *
   * @param silent - true: non tocca stato né avvisi se non riesce (usato mentre
   *   si attende il codice OTP); false: all'avvio, dove il fallimento porta al
   *   login (con l'avviso se l'utente è in SSO ma non può usare questo tool)
   * @returns true se è stata aperta una sessione
   */
  async function trySso(silent = false): Promise<boolean> {
    let res: Response;
    try {
      res = await doFetch(url('sso/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config.tool ? { tool: config.tool } : {}),
      });
    } catch {
      // Rete assente o CORS non configurata: nessuna sessione SSO utilizzabile
      if (!silent && !state.token) set({ status: 'anonymous' });
      return false;
    }
    const data = (await res.json().catch(() => null)) as (LoginResponse & HubErrorBody) | null;
    // Un login (OTP, link o altro) è avvenuto nel frattempo: la risposta non serve più
    if (state.token) return false;

    if (res.ok && data?.session_token && data.user_id) {
      openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
      await refresh();
      return true;
    }
    if (!silent) {
      const error = errorFromBody(res.status, data);
      const notice: AuthNotice | null =
        error.code === 'ToolNotEnabled' ? 'tool_not_enabled'
          : error.code === 'TrialExpired' ? 'trial_expired'
            : null;
      set({ status: 'anonymous', notice });
    }
    return false;
  }

  /**
   * Mentre si attende il codice OTP, se l'utente apre il magic link in un'altra
   * scheda dello stesso browser (che crea la sessione SSO), al ritorno su questa
   * scheda si prova a entrare da soli, senza far digitare il codice.
   * Il listener si toglie da solo quando lo step non è più 'otp'.
   */
  let ssoPollAttached = false;
  function pollSsoWhileWaiting(): void {
    if (!config.sso || ssoPollAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
    ssoPollAttached = true;

    const detach = (): void => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      ssoPollAttached = false;
    };
    function check(): void {
      if (state.step !== 'otp' || state.token) {
        detach();
        return;
      }
      if (document.visibilityState === 'hidden' || state.loading) return;
      void trySso(true).then((ok) => {
        if (ok) set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
      });
    }
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
  }

  /**
   * Adotta una sessione ottenuta da un meccanismo diverso da otp-verify (es.
   * lo scambio di un magic link via /access-links/exchange): stesso
   * trattamento di un login OTP riuscito, incluso il refresh immediato da
   * GET /me per completare profilo, ruolo e tool.
   *
   * @param session.token - session_token già emesso da hub (Bearer valido)
   * @param session.user - dati noti dell'utente (tipicamente solo user_id ed
   *   email); i campi mancanti arrivano dal refresh successivo
   */
  async function adoptSession(session: { token: string; user: Partial<HubUser> & { user_id: string } }): Promise<void> {
    openSession(session.token, { ...partialUser(session.user.user_id, session.user.email ?? null), ...session.user });
    await refresh();
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
      // Aperto da un magic link: si attende la conferma dell'utente (step 'link')
      if (linkToken) {
        set({ status: 'anonymous', step: 'link' });
        return;
      }
      // SSO: lo stato resta 'checking' finché lo scambio del cookie non ha risposto
      if (config.sso) {
        void trySso();
        return;
      }
      set({ status: 'anonymous' });
      return;
    }
    // Sessione già presente: un eventuale magic link aperto in più non serve
    linkToken = null;
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
    tool: config.tool,
    getToken: () => state.token,
    url,
    requestOtp,
    verifyOtp,
    verifyLink,
    cancelLink,
    adoptSession,
    resetToEmail: () => set({ step: 'email', pendingEmail: '', otpRequestedAt: null }),
    loadToolConfig,
    startRegister,
    register,
    refresh,
    logout,
    forceLogout,
    handleUnauthorized,
    authHeaders,
    authFetch,
    installAxiosInterceptors,
  };
}
