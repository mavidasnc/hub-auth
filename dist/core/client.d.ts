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
import { type StorageAdapter } from './storage.js';
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
    privacy: {
        text: string;
        version: string;
        format?: 'markdown' | 'text';
    } | null;
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
    onLogout?: (info: {
        userId: string | null;
        notice: AuthNotice | null;
    }) => void;
}
/** Istanza axios minima usata da installAxiosInterceptors (nessuna dipendenza da axios) */
export interface AxiosLike {
    interceptors: {
        request: {
            use(onFulfilled: (config: any) => any): number;
            eject(id: number): void;
        };
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
    adoptSession(session: {
        token: string;
        user: Partial<HubUser> & {
            user_id: string;
        };
    }): Promise<void>;
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
    logout(notice?: AuthNotice, options?: {
        global?: boolean;
    }): void;
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
/**
 * Crea il client di autenticazione.
 *
 * Va creato una sola volta per applicazione (tipicamente in src/auth.js) e
 * condiviso da provider React e moduli di rete.
 */
export declare function createHubAuth(config: HubAuthConfig): HubAuthClient;
