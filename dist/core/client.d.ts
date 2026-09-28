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
/**
 * Crea il client di autenticazione.
 *
 * Va creato una sola volta per applicazione (tipicamente in src/auth.js) e
 * condiviso da provider React e moduli di rete.
 */
export declare function createHubAuth(config: HubAuthConfig): HubAuthClient;
