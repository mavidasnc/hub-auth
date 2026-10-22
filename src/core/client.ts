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
 *
 * Dalla 1.12.0:
 * - coupon di registrazione: campo `coupon` di `register()` e link di invito
 *   (`?coupon=CODICE` nell'URL: `inviteCoupon`, verificato da hub con tool-config)
 * - un 401 su una sessione salvata, con `sso`, tenta una volta lo scambio del
 *   cookie SSO prima di mandare l'utente al login
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
 * - coupon_invalid: il coupon del link di invito (?coupon=) non è valido
 * - subscription_required: 403 SubscriptionRequired a sessione aperta (abbonamento scaduto, dalla 1.14.0)
 * - payment_received: tornato da PayPal a pagamento riuscito ma senza una sessione da riprendere
 * - payment_pending: PayPal non ha ancora confermato il pagamento (arriva dal webhook)
 * - payment_failed: il pagamento non è andato a buon fine o non è stato confermato
 */
export type AuthNotice =
  | 'session_expired' | 'tool_not_enabled' | 'trial_expired' | 'link_invalid' | 'coupon_invalid'
  | 'subscription_required' | 'payment_received' | 'payment_pending' | 'payment_failed';

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

/**
 * Step del flusso di login. 'subscribe' (dalla 1.14.0): l'accesso è valido ma manca un
 * abbonamento, si sceglie il piano e si paga (hub >= 0.267.0, pagamenti accesi)
 */
export type AuthStep = 'email' | 'otp' | 'link' | 'register' | 'registered' | 'subscribe';

/** Piano Fleet del listino pubblico (GET /billing/catalog); gli importi sono in centesimi, IVA esclusa */
export interface BillingPlan {
  code: string;
  label: string;
  /** Prezzo mensile in vigore (di lancio o di listino) */
  monthly_cents: number;
  list_monthly_cents: number;
  launch_monthly_cents: number;
  app_discount_pct: number;
  /** Siti inclusi (dal piano interno associato); null se non noto */
  sites_max: number | null;
}

/** App acquistabile a parte */
export interface BillingApp {
  key: string;
  label: string;
}

/** Listino per la pagina di pagamento (GET /billing/catalog, hub >= 0.267.0) */
export interface BillingCatalog {
  /** false: i pagamenti non sono accesi (il listino serve solo per l'anteprima) */
  enabled: boolean;
  currency: string;
  vat_rate_pct: number;
  price_basis: 'launch' | 'list';
  launch_until: string | null;
  months: number;
  plans: BillingPlan[];
  apps: BillingApp[];
  app_tiers: { count: number; base_monthly_cents: number }[];
  no_fleet_markup_pct: number;
}

/** Cosa si vuole comprare: un piano Fleet con o senza app, oppure sole app */
export interface BillingSelection {
  /** Codice del piano (null = solo app) */
  fleet_plan: string | null;
  apps: string[];
}

/** Prezzo di una scelta, calcolato da hub (POST /billing/quote); importi in centesimi */
export interface BillingQuote {
  price_basis: 'launch' | 'list';
  fleet_plan: string | null;
  apps: string[];
  fleet_monthly_cents: number;
  app_monthly_cents: number;
  monthly_cents: number;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  vat_rate_pct: number;
  currency: string;
}

/** Ordine: la scelta più i dati per la fattura (serve la partita IVA o il codice fiscale) */
export interface BillingOrder extends BillingSelection {
  billing_name: string;
  vat_number?: string;
  tax_code?: string;
  sdi_code?: string;
  pec_email?: string;
  /** Codice paese a due lettere (default IT) */
  billing_country?: string;
}

/**
 * Configurazione pubblica della schermata di login (GET /auth/tool-config)
 * - tool: etichetta, descrizione e avviso del tool (null se `tool` non è
 *   impostato o hub non lo conosce)
 * - signup_enabled: hub offre la registrazione per questo tool
 * - privacy: testo, versione e formato ('markdown' | 'text') dell'informativa
 *   (solo se la registrazione è offerta)
 * - coupon_valid: esito del coupon del link di invito (hub >= 0.260.0; assente se
 *   la pagina non ha `?coupon=` o hub è più vecchio). Un coupon valido apre la
 *   registrazione anche quando è chiusa: `signup_enabled` è allora true
 * - trial_days: giorni di prova da promettere nella CTA di registrazione (hub >=
 *   0.261.0): quelli del coupon valido o delle impostazioni; assente se la
 *   registrazione non è offerta, il trial non ha scadenza o hub è più vecchio
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
  coupon_valid?: boolean;
  trial_days?: number;
}

/** Dati del form di registrazione */
export interface RegisterData {
  username: string;
  email: string;
  /** Consenso all'informativa privacy: deve essere true */
  privacyAccepted: boolean;
  /**
   * Coupon di registrazione (opzionale, hub >= 0.260.0): sovrascrive trial, piano e
   * approvazione e può aprire una registrazione chiusa. Un codice non valido,
   * scaduto o esaurito fa lanciare `InvalidCoupon` e ferma la registrazione.
   */
  coupon?: string;
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
  /**
   * Coupon del link di invito (`?coupon=CODICE` nell'URL della pagina), null se assente:
   * precompila il campo del form di registrazione e, se hub lo trova valido, porta
   * direttamente alla registrazione anche quando è chiusa
   */
  inviteCoupon: string | null;
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
  /**
   * Naviga verso un indirizzo (default: `window.location.assign`). Serve a `startCheckout`
   * per portare l'utente su PayPal; si sostituisce nei test o in un contenitore che non usa la pagina.
   */
  redirect?: (url: string) => void;
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
  /**
   * Listino dei piani e delle app (GET /billing/catalog, dalla 1.14.0). Usa il token di
   * pagamento dello step 'subscribe' oppure, senza, la sessione aperta (anteprima admin).
   */
  loadBillingCatalog(): Promise<BillingCatalog>;
  /** Prezzo di una scelta calcolato da hub (POST /billing/quote): il client non calcola mai gli importi */
  billingQuote(selection: BillingSelection): Promise<BillingQuote>;
  /**
   * Crea l'ordine (POST /billing/orders) e porta l'utente a PayPal; al ritorno la pagina riparte
   * e la sessione si apre da sola. Lancia HubAuthError (BillingDisabled, PlanNotMapped,
   * PayPalUnavailable, ValidationError...).
   */
  startCheckout(order: BillingOrder): Promise<void>;
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

/** href della pagina corrente (base per risolvere URL relativi); undefined fuori dal browser */
function pageHref(): string | undefined {
  return typeof window !== 'undefined' ? window.location.href : undefined;
}

/** Origine di un URL (relativo alla pagina corrente); null se non interpretabile o opaca */
function originOf(target: string): string | null {
  try {
    const origin = new URL(target, pageHref()).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * URL finale di una richiesta axios, risolto come fa axios: un `url` assoluto
 * (anche protocol-relative) ignora `baseURL`, uno relativo si somma a `baseURL`.
 */
function axiosTarget(baseURL: unknown, target: unknown): string | null {
  try {
    const root = new URL(typeof baseURL === 'string' ? baseURL : '', pageHref());
    return new URL(typeof target === 'string' ? target : '', root).href;
  } catch {
    return null;
  }
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
  return {
    tool,
    signup_enabled: obj.signup_enabled,
    privacy,
    // Solo se hub ha controllato un coupon (hub >= 0.260.0 con ?coupon= nella richiesta)
    ...(typeof obj.coupon_valid === 'boolean' ? { coupon_valid: obj.coupon_valid } : {}),
    // Solo un numero intero di giorni sensato: null o assente = nessuna promessa nella CTA
    ...(Number.isInteger(obj.trial_days) && obj.trial_days > 0 ? { trial_days: obj.trial_days as number } : {}),
  };
}

/** Parametro della query che porta il coupon del link di invito (?coupon=CODICE) */
const COUPON_PARAM = 'coupon';

/** Forma ammessa del coupon letto dall'URL (hub lo normalizza e decide se è valido) */
const COUPON_RE = /^[A-Za-z0-9_-]{1,60}$/;

/**
 * Legge il coupon del link di invito dalla query dell'URL. Non lo rimuove: non è
 * un segreto e così un ricaricamento della pagina lo ritrova.
 *
 * @returns il coupon se presente e ben formato, altrimenti null
 */
function readCouponFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  const value = new URLSearchParams(window.location.search).get(COUPON_PARAM)?.trim() ?? '';
  return COUPON_RE.test(value) ? value : null;
}

/** Parametro della query con cui hub riporta all'app dopo PayPal (?billing=paid|pending|cancelled|error) */
const BILLING_RETURN_PARAM = 'billing';

type BillingReturn = 'paid' | 'pending' | 'cancelled' | 'error';

/**
 * Legge l'esito del ritorno da PayPal dalla query dell'URL e lo RIMUOVE (history.replaceState),
 * così un ricaricamento non lo rielabora.
 *
 * @returns l'esito se presente e noto, altrimenti null
 */
function takeBillingReturn(): BillingReturn | null {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(BILLING_RETURN_PARAM);
  if (value === null) return null;

  params.delete(BILLING_RETURN_PARAM);
  const rest = params.toString();
  try {
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${rest ? `?${rest}` : ''}${hash}`);
  } catch {
    // history non disponibile: l'esito resta nell'URL ma non cambia nulla se riletto
  }
  return value === 'paid' || value === 'pending' || value === 'cancelled' || value === 'error' ? value : null;
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

  // Pagamento: token di hub per le rotte /billing/* (30 minuti, solo in memoria e, durante il
  // viaggio su PayPal, in sessionStorage). Dopo il ritorno da PayPal l'esito arriva nella query.
  const billingKey = `${config.storageKey}:billing`;
  const billingReturn = takeBillingReturn();
  let billingToken: string | null = null;
  if (billingReturn) {
    try {
      billingToken = window.sessionStorage.getItem(billingKey);
    } catch {
      // sessionStorage non accessibile: si riparte dal login
    }
  }

  let state: AuthState = {
    status: 'checking',
    user: null,
    token: null,
    // Pagamento riuscito ma senza token da riprendere, in attesa o fallito: lo si dice nel login
    notice: billingReturn === 'pending' ? 'payment_pending'
      : billingReturn === 'error' ? 'payment_failed'
        : billingReturn === 'paid' && !billingToken ? 'payment_received'
          : null,
    step: 'email',
    toolConfig: null,
    inviteCoupon: readCouponFromUrl(),
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

  /** Origine di hub (da baseUrl); null se baseUrl non è interpretabile */
  const hubOrigin = originOf(base);

  /**
   * Il Bearer va solo a hub: un URL assoluto verso un'altra origine non deve
   * mai ricevere il token (una XSS o un link costruito ad arte lo esporrebbe).
   * Fail-closed: se l'origine non si determina, il token non viene allegato.
   */
  function isHubUrl(target: string | null): boolean {
    if (!hubOrigin || !target) return false;
    return originOf(target) === hubOrigin;
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
    clearBilling();
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
    if (token) revokeToken(token, global);
    // Logout voluto dall'utente: le altre schede dello stesso browser escono con lui
    if (!reason) announce('logout');
  }

  /**
   * Revoca il token su hub (best effort). Con `global` chiede anche di cancellare
   * il cookie SSO, e per questo viaggia con le credenziali: se l'origine dell'app
   * non è in SSO_ALLOWED_ORIGINS il browser blocca la richiesta già al preflight
   * (errore di rete, nulla è stato inviato). In quel caso si ripete senza
   * credenziali, così almeno il token viene revocato, e si avvisa in console.
   */
  function revokeToken(token: string, global: boolean): void {
    const headers = { Authorization: `Bearer ${token}` };
    doFetch(url(global ? 'logout?scope=global' : 'logout'), {
      method: 'POST',
      headers,
      // Il cookie SSO viaggia (e viene cancellato) solo con le credenziali
      ...(global ? { credentials: 'include' as const } : {}),
    }).catch((err) => {
      if (!global) return undefined;
      console.warn('[hub-auth] logout globale non riuscito, revoca solo del token:', err);
      return doFetch(url('logout'), { method: 'POST', headers }).catch(() => undefined);
    });
  }

  // ── Sincronizzazione fra schede ────────────────────────────────────────────

  /**
   * Canale fra le schede dello stesso browser e della stessa app (stessa
   * `storageKey`). Non si usa l'evento `storage`: non scatta con IndexedDB né
   * con lo storage in memoria. Il messaggio non trasporta mai il token.
   */
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(`hub-auth:${config.storageKey}`);
      channel.onmessage = (event: MessageEvent) => {
        const type = (event.data as { type?: string } | null)?.type;
        if (type === 'logout') {
          const token = state.token;
          if (!token) return;
          // Uscita locale senza ritrasmettere (niente rimbalzo) e revoca del token di questa scheda
          forceLogout();
          revokeToken(token, false);
        } else if (type === 'login') {
          void adoptFromOtherTab();
        }
      };
    } catch {
      channel = null;
    }
  }

  function announce(type: 'login' | 'logout'): void {
    try {
      channel?.postMessage({ type });
    } catch {
      // Canale chiuso o non disponibile: le altre schede si allineeranno al prossimo avvio
    }
  }

  /** Un'altra scheda ha fatto il login: se questa è senza sessione la riprende dallo storage o dal cookie SSO */
  async function adoptFromOtherTab(): Promise<void> {
    if (state.token) return;
    try {
      const session = sessionFromStorage(await storage.get(config.storageKey));
      if (session && !state.token) {
        openSession(session.token, session.user);
        set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
        await refresh();
        return;
      }
    } catch {
      // Storage non leggibile: si prova il cookie SSO
    }
    if (config.sso && !state.token && (await trySso(true))) {
      set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
    }
  }

  function handleUnauthorized(usedToken?: string | null): void {
    if (!state.token) return;
    if (usedToken && usedToken !== state.token) return;
    void expireSession(state.token);
  }

  /** Ultimo recupero via SSO riuscito (ms): se la sessione appena ottenuta riceve ancora 401 non si ripete (niente cicli) */
  let lastSsoRecoveryAt = 0;
  /** Recupero in corso: più 401 in parallelo (richieste simultanee) ne avviano uno solo */
  let ssoRecovery: Promise<void> | null = null;
  const SSO_RECOVERY_COOLDOWN_MS = 10_000;

  /**
   * La sessione di questa app ha ricevuto 401 (token revocato o scaduto, logout globale
   * da un'altra app, cambio di browser...). Con SSO il cookie può essere ancora valido, per
   * esempio perché l'utente ha fatto un nuovo accesso in un'altra app: prima di mandarlo al
   * login lo si prova una volta (stesso scambio del boot senza sessione). Se il cookie non
   * c'è o non vale, logout come prima, con l'avviso `session_expired`.
   *
   * @param token - il token che ha ricevuto il 401
   */
  async function expireSession(token: string): Promise<void> {
    if (!config.sso || Date.now() - lastSsoRecoveryAt < SSO_RECOVERY_COOLDOWN_MS) {
      forceLogout('session_expired');
      return;
    }
    ssoRecovery ??= (async () => {
      const recovered = await trySso(true, token);
      // Nel frattempo logout o nuovo login: non c'è più nulla da chiudere
      if (!recovered && state.token === token) forceLogout('session_expired');
    })().finally(() => { ssoRecovery = null; });
    await ssoRecovery;
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
      await expireSession(token);
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
    // Abbonamento scaduto a sessione aperta: si esce, al prossimo accesso compare il pagamento
    if (error.code === 'SubscriptionRequired') {
      logout('subscription_required');
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
      announce('login');
      // Profilo, ruolo e tool arrivano da /me (con le stesse regole del boot)
      await refresh();
    } catch (err) {
      // Codice giusto ma manca l'abbonamento: non è un errore del codice, si passa a pagare
      if (err instanceof HubAuthError && enterSubscribe(err)) return;
      throw err;
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
      announce('login');
      await refresh();
    } catch (err) {
      // Link morto (401: sconosciuto, scaduto, già usato) o accesso negato: inutile
      // riprovare, si torna al login con l'avviso. Rete, 429 e 5xx vengono lanciati
      // e il link resta valido per un nuovo tentativo.
      if (err instanceof HubAuthError) {
        // Link valido ma manca l'abbonamento: il link è consumato, si passa a pagare
        if (enterSubscribe(err)) {
          linkToken = null;
          return;
        }
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

  // ── Pagamento (hub >= 0.267.0) ─────────────────────────────────────────────

  /** Dimentica il token di pagamento, anche quello lasciato in sessionStorage per il viaggio su PayPal */
  function clearBilling(): void {
    billingToken = null;
    try {
      window.sessionStorage.removeItem(billingKey);
    } catch {
      // sessionStorage non accessibile: non c'è nulla da togliere
    }
  }

  /**
   * Un 403 SubscriptionRequired con il token di pagamento porta allo step 'subscribe'.
   *
   * @param notice - avviso da mostrare sopra la scelta (opzionale)
   * @returns true se l'errore era proprio quello e lo step è stato aperto
   */
  function enterSubscribe(err: HubAuthError, notice: AuthNotice | null = null): boolean {
    const token = err.details?.billing_token;
    if (err.code !== 'SubscriptionRequired' || typeof token !== 'string' || !token) return false;
    billingToken = token;
    set({ status: 'anonymous', step: 'subscribe', notice, loading: false, pendingEmail: '', otpRequestedAt: null });
    return true;
  }

  /**
   * Richiesta alle rotte /billing/*: con il token di pagamento (step 'subscribe') oppure,
   * senza, con la sessione aperta (anteprima dalla dashboard admin). Lancia HubAuthError.
   */
  async function billingRequest<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
    const init: RequestInit = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    let res: Response;
    try {
      if (billingToken) {
        headers['X-Billing-Token'] = billingToken;
        res = await doFetch(url(path), init);
      } else {
        res = await authFetch(path, init);
      }
    } catch (err) {
      throw networkError(err);
    }
    const data = (await res.json().catch(() => null)) as (T & HubErrorBody) | null;
    if (!res.ok) {
      // Token di pagamento scaduto (30 minuti): si riparte dal login
      if (res.status === 401 && billingToken) {
        clearBilling();
        set({ step: 'email', notice: 'session_expired' });
      }
      throw errorFromBody(res.status, data);
    }
    return data as T;
  }

  async function loadBillingCatalog(): Promise<BillingCatalog> {
    const data = await billingRequest<BillingCatalog>('billing/catalog', 'GET');
    if (!data || !Array.isArray(data.plans) || !Array.isArray(data.apps)) {
      throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
    }
    return data;
  }

  function billingQuote(selection: BillingSelection): Promise<BillingQuote> {
    return billingRequest<BillingQuote>('billing/quote', 'POST', selection);
  }

  async function startCheckout(order: BillingOrder): Promise<void> {
    set({ loading: true, notice: null });
    try {
      const body: Record<string, unknown> = { ...order };
      // App a cui tornare dopo PayPal (con il token di pagamento conta quella del token)
      if (config.tool) body.tool = config.tool;
      const data = await billingRequest<{ approve_url?: string }>('billing/orders', 'POST', body);
      const approve = data?.approve_url;
      if (typeof approve !== 'string' || !/^https:\/\//i.test(approve)) {
        throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
      }
      // La pagina riparte da zero al ritorno: il token deve sopravvivere al viaggio su PayPal
      if (billingToken) {
        try {
          window.sessionStorage.setItem(billingKey, billingToken);
        } catch {
          // sessionStorage non accessibile: al ritorno si riparte dal login
        }
      }
      (config.redirect ?? ((target) => window.location.assign(target)))(approve);
    } finally {
      set({ loading: false });
    }
  }

  /**
   * Al ritorno da PayPal a pagamento riuscito: con il token di pagamento salvato si apre la
   * sessione (POST /billing/complete) senza un nuovo codice OTP. Se hub non vede ancora il
   * pagamento o il token è scaduto si torna al login con un avviso.
   */
  async function completeCheckout(): Promise<void> {
    set({ loading: true, notice: null });
    try {
      const data = await billingRequest<LoginResponse>('billing/complete', 'POST', {});
      if (!data?.session_token || !data.user_id) {
        throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
      }
      clearBilling();
      openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
      set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
      announce('login');
      await refresh();
    } catch (err) {
      const waiting = err instanceof HubAuthError && err.code === 'SubscriptionRequired';
      clearBilling();
      set({ status: 'anonymous', step: 'email', notice: waiting ? 'payment_pending' : 'payment_received' });
    } finally {
      set({ loading: false });
    }
  }

  // ── Configurazione pubblica e registrazione ────────────────────────────────

  /** Richiesta in corso di GET /auth/tool-config: evita chiamate doppie */
  let toolConfigRequest: Promise<void> | null = null;

  /** Il coupon del link di invito è già stato valutato (la prima volta soltanto: il form non va riaperto a ogni ricarica) */
  let inviteHandled = false;

  async function fetchToolConfig(): Promise<void> {
    try {
      // Il coupon del link di invito viaggia con la richiesta: hub dice se è valido e,
      // se lo è, offre la registrazione anche quando è chiusa
      const params = new URLSearchParams();
      if (config.tool) params.set('tool', config.tool);
      if (state.inviteCoupon) params.set(COUPON_PARAM, state.inviteCoupon);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await doFetch(url(`auth/tool-config${query}`));
      if (!res.ok) return;
      const parsed = toolConfigFromBody(await res.json().catch(() => null));
      if (!parsed) return;
      set({ toolConfig: parsed });

      if (inviteHandled || state.inviteCoupon === null || parsed.coupon_valid === undefined) return;
      inviteHandled = true;
      if (state.status !== 'anonymous' || state.step !== 'email') return;
      // Coupon valido: il link è un invito, si apre subito la registrazione. Non valido: lo si dice
      if (parsed.coupon_valid && parsed.signup_enabled) set({ step: 'register', notice: null });
      else if (!parsed.coupon_valid) set({ notice: 'coupon_invalid' });
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
      const coupon = data.coupon?.trim();
      if (coupon) body.coupon = coupon;
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
   * @param replacing - token di una sessione appena rifiutata (401) che lo scambio
   *   può sostituire: senza, una sessione già aperta fa scartare la risposta. Se
   *   l'utente del cookie è un altro, `onLogout` pulisce i dati del precedente
   * @returns true se è stata aperta una sessione
   */
  async function trySso(silent = false, replacing?: string): Promise<boolean> {
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
    if (state.token && state.token !== replacing) return false;

    if (res.ok && data?.session_token && data.user_id) {
      const previousUserId = replacing ? state.user?.user_id ?? null : null;
      // Prima di /me: se anche la sessione nuova ricevesse 401 non si riprova subito (niente cicli)
      if (replacing) lastSsoRecoveryAt = Date.now();
      openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
      if (previousUserId && previousUserId !== data.user_id) {
        // Il cookie appartiene a un altro utente: i dati locali del precedente vanno puliti
        try {
          config.onLogout?.({ userId: previousUserId, notice: null });
        } catch (err) {
          console.error('[hub-auth] onLogout ha lanciato un errore:', err);
        }
      }
      await refresh();
      return true;
    }
    if (!silent) {
      const error = errorFromBody(res.status, data);
      // Utente in SSO ma senza abbonamento per questo tool: si passa direttamente a pagare
      if (enterSubscribe(error)) return false;
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
    announce('login');
    await refresh();
  }

  // ── Integrazione con i client HTTP dei progetti ────────────────────────────

  function authHeaders(): Record<string, string> {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
  }

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const target = url(path);
    // Bearer solo verso l'origine di hub (vedi isHubUrl); gli altri URL passano senza token
    if (state.token && !headers.has('Authorization') && isHubUrl(target)) {
      headers.set('Authorization', `Bearer ${state.token}`);
    }
    const res = await doFetch(target, { ...init, headers });
    if (res.status === 401) handleUnauthorized(bearerOf(headers.get('Authorization')));
    // Abbonamento scaduto a sessione aperta: si esce con l'avviso (solo se la sessione è ancora quella)
    if (res.status === 403 && state.token && bearerOf(headers.get('Authorization')) === state.token) {
      const body = (await res.clone().json().catch(() => null)) as HubErrorBody | null;
      if (body?.error === 'SubscriptionRequired') logout('subscription_required');
    }
    return res;
  }

  function installAxiosInterceptors(instance: AxiosLike): () => void {
    /** Legge un header da AxiosHeaders (axios 1.x) o da un oggetto semplice */
    const readHeader = (headers: any, name: string): unknown =>
      typeof headers?.get === 'function' ? headers.get(name) : headers?.[name];

    const requestId = instance.interceptors.request.use((cfg) => {
      if (!state.token) return cfg;
      // Bearer solo se la richiesta (baseURL + url, come li risolve axios) va a hub
      if (!isHubUrl(axiosTarget(cfg.baseURL, cfg.url))) return cfg;
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
        } else if (error?.response?.status === 403 && error.response.data?.error === 'SubscriptionRequired'
          && state.token && bearerOf(readHeader(error.config?.headers, 'Authorization')) === state.token) {
          // Abbonamento scaduto a sessione aperta: si esce con l'avviso
          logout('subscription_required');
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
      // Tornato da PayPal: a pagamento riuscito si apre la sessione col token salvato; se ha
      // annullato si riapre la scelta; negli altri casi il token non serve più
      if (billingReturn === 'paid' && billingToken) {
        void completeCheckout();
        return;
      }
      if (billingReturn === 'cancelled' && billingToken) {
        set({ status: 'anonymous', step: 'subscribe' });
        return;
      }
      if (billingToken) clearBilling();
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
    // Sessione già presente: un eventuale magic link aperto in più non serve, né il token di pagamento
    linkToken = null;
    if (billingToken) clearBilling();
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
    resetToEmail: () => {
      clearBilling();
      set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
    },
    loadToolConfig,
    startRegister,
    register,
    loadBillingCatalog,
    billingQuote,
    startCheckout,
    refresh,
    logout,
    forceLogout,
    handleUnauthorized,
    authHeaders,
    authFetch,
    installAxiosInterceptors,
  };
}
