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
import { errorFromBody, HubAuthError, networkError } from './errors.js';
import { localStorageAdapter } from './storage.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** true se il valore è una Promise (o thenable) */
function isPromise(value) {
    return !!value && typeof value.then === 'function';
}
/** Estrae il token da un header Authorization "Bearer <token>" */
function bearerOf(header) {
    return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
}
/** Normalizza il body di GET /me in HubUser */
function userFromMe(body) {
    const str = (v) => (typeof v === 'string' ? v : null);
    return {
        user_id: String(body.user_id ?? ''),
        email: str(body.email),
        username: str(body.username),
        role: str(body.role),
        plan: str(body.plan),
        status: str(body.status),
        expires_at: str(body.expires_at),
        tools: Array.isArray(body.tools) ? body.tools.filter((t) => typeof t === 'string') : [],
    };
}
/** Utente parziale (solo id ed email), in attesa della risposta di /me */
function partialUser(userId, email) {
    return { user_id: userId, email, username: null, role: null, plan: null, status: null, expires_at: null, tools: [] };
}
/**
 * Estrae token, user_id ed email da una vecchia sessione di progetto.
 * Copre le forme usate finora: {token, userId, email}, {session_token, user_id},
 * {token, user: {user_id, email}}.
 */
function sessionFromLegacy(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const obj = raw;
    const token = obj.token ?? obj.session_token ?? obj.sessionToken;
    if (typeof token !== 'string' || !token)
        return null;
    const userId = obj.userId ?? obj.user_id ?? obj.user?.user_id ?? obj.user?.id ?? '';
    const email = obj.email ?? obj.user?.email ?? null;
    return { v: 1, token, user: partialUser(String(userId), typeof email === 'string' ? email : null) };
}
/** Valida una sessione letta dallo storage nel formato della libreria */
function sessionFromStorage(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const obj = raw;
    return obj.v === 1 && typeof obj.token === 'string' && obj.token ? obj : null;
}
/** Valida il body di GET /auth/tool-config; null se la forma non è quella attesa */
function toolConfigFromBody(body) {
    if (!body || typeof body !== 'object')
        return null;
    const obj = body;
    if (typeof obj.signup_enabled !== 'boolean')
        return null;
    const str = (v) => (typeof v === 'string' && v ? v : null);
    const tool = obj.tool && typeof obj.tool === 'object' && typeof obj.tool.key === 'string'
        ? {
            key: obj.tool.key,
            label: str(obj.tool.label),
            description: str(obj.tool.description),
            login_notice: str(obj.tool.login_notice),
        }
        : null;
    const privacy = obj.privacy && typeof obj.privacy.text === 'string' && typeof obj.privacy.version === 'string'
        ? {
            text: obj.privacy.text,
            version: obj.privacy.version,
            // Hub più vecchi non inviano il formato: il campo manca e vale testo semplice
            ...(obj.privacy.format === 'markdown' ? { format: 'markdown' } : {}),
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
function takeLinkFromUrl() {
    if (typeof window === 'undefined' || !window.location?.hash)
        return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get(LINK_PARAM);
    if (token === null)
        return null;
    params.delete(LINK_PARAM);
    const rest = params.toString();
    try {
        const { pathname, search } = window.location;
        window.history.replaceState(window.history.state, '', `${pathname}${search}${rest ? `#${rest}` : ''}`);
    }
    catch {
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
export function createHubAuth(config) {
    const storage = config.storage ?? localStorageAdapter;
    const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
    // fetch risolta a ogni chiamata: i test (e gli eventuali polyfill) possono sostituirla dopo la creazione
    const doFetch = (...args) => (config.fetch ?? globalThis.fetch)(...args);
    // Il magic link è attivo di default; il token vive solo in memoria (mai nello stato osservabile)
    let linkToken = config.magicLink === false ? null : takeLinkFromUrl();
    let state = {
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
    const listeners = new Set();
    let onlineListenerAttached = false;
    // ── Stato ──────────────────────────────────────────────────────────────────
    /** Aggiorna lo stato (nuovo riferimento) e notifica i listener */
    function set(patch) {
        state = { ...state, ...patch };
        listeners.forEach((listener) => listener());
    }
    /** Salva la sessione corrente nello storage (best effort) */
    function persist() {
        if (!state.token)
            return;
        const session = { v: 1, token: state.token, user: state.user };
        try {
            const result = storage.set(config.storageKey, session);
            if (isPromise(result))
                result.catch((err) => console.warn('[hub-auth] salvataggio sessione fallito:', err));
        }
        catch (err) {
            console.warn('[hub-auth] salvataggio sessione fallito:', err);
        }
    }
    /** Rimuove una chiave dallo storage (best effort) */
    function removeKey(key) {
        try {
            const result = storage.remove(key);
            if (isPromise(result))
                result.catch(() => undefined);
        }
        catch {
            // Storage non accessibile: niente da rimuovere
        }
    }
    // ── Rete ───────────────────────────────────────────────────────────────────
    function url(path) {
        return /^https?:\/\//i.test(path) ? path : `${base}${path.replace(/^\/+/, '')}`;
    }
    /**
     * POST JSON su un endpoint pubblico di login; lancia HubAuthError sugli errori.
     * @param credentials - invia/riceve i cookie (serve a hub per impostare il cookie SSO)
     */
    async function publicPost(path, body, credentials = false) {
        let res;
        try {
            res = await doFetch(url(path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                ...(credentials ? { credentials: 'include' } : {}),
            });
        }
        catch (err) {
            throw networkError(err);
        }
        const data = (await res.json().catch(() => null));
        if (!res.ok)
            throw errorFromBody(res.status, data);
        return data;
    }
    /**
     * POST di un endpoint che apre la sessione (otp-verify, otp-verify-link).
     * Con `sso` chiede anche il cookie SSO. Se l'origine dell'app non è ancora in
     * SSO_ALLOWED_ORIGINS di hub, il browser blocca la richiesta con credenziali
     * già al preflight (errore di rete, nulla è stato inviato): in quel caso si
     * ripete una volta senza SSO, così una configurazione incompleta non impedisce il login.
     */
    async function loginPost(path, body) {
        if (!config.sso)
            return publicPost(path, body);
        try {
            return await publicPost(path, { ...body, sso: true }, true);
        }
        catch (err) {
            if (!(err instanceof HubAuthError) || err.code !== 'NetworkError')
                throw err;
            return publicPost(path, body);
        }
    }
    // ── Sessione ───────────────────────────────────────────────────────────────
    /** Apre la sessione in memoria e la persiste */
    function openSession(token, user) {
        set({ token, user, status: 'checking', notice: null, offline: false });
        persist();
    }
    function forceLogout(notice) {
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
        }
        catch (err) {
            console.error('[hub-auth] onLogout ha lanciato un errore:', err);
        }
    }
    function logout(notice, options) {
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
                ...(global ? { credentials: 'include' } : {}),
            }).catch(() => undefined);
        }
    }
    function handleUnauthorized(usedToken) {
        if (!state.token)
            return;
        if (usedToken && usedToken !== state.token)
            return;
        forceLogout('session_expired');
    }
    /** Al ritorno della rete riprova la verifica della sessione (un solo listener) */
    function retryWhenOnline() {
        if (onlineListenerAttached || typeof window === 'undefined')
            return;
        onlineListenerAttached = true;
        window.addEventListener('online', () => {
            onlineListenerAttached = false;
            void refresh();
        }, { once: true });
    }
    async function refresh() {
        const token = state.token;
        if (!token)
            return;
        const query = config.tool ? `?tool=${encodeURIComponent(config.tool)}` : '';
        let res;
        try {
            res = await doFetch(url(`me${query}`), { headers: { Authorization: `Bearer ${token}` } });
        }
        catch {
            // Rete assente: la sessione salvata resta valida, si riprova più tardi
            if (state.token === token) {
                set({ status: 'authenticated', offline: true });
                retryWhenOnline();
            }
            return;
        }
        // Logout o nuovo login avvenuti durante la richiesta: risposta non più pertinente
        if (state.token !== token)
            return;
        const body = (await res.json().catch(() => null));
        if (res.ok && body) {
            set({ user: userFromMe(body), status: 'authenticated', offline: false });
            persist();
            return;
        }
        if (res.status === 401) {
            forceLogout('session_expired');
            return;
        }
        const error = errorFromBody(res.status, body);
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
    async function requestOtp(email) {
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
        }
        finally {
            set({ loading: false });
        }
    }
    async function verifyOtp(code) {
        const otp = code.trim();
        if (!/^\d{6}$/.test(otp)) {
            throw new HubAuthError('Il codice deve essere di 6 cifre.', 400, 'InvalidCode');
        }
        const email = state.pendingEmail;
        set({ loading: true, notice: null });
        try {
            const body = { email, otp_code: otp };
            if (config.tool)
                body.tool = config.tool;
            const data = await loginPost('otp-verify', body);
            if (!data?.session_token || !data.user_id) {
                throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
            }
            openSession(data.session_token, partialUser(data.user_id, data.email ?? email));
            set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
            // Profilo, ruolo e tool arrivano da /me (con le stesse regole del boot)
            await refresh();
        }
        finally {
            set({ loading: false });
        }
    }
    async function verifyLink() {
        const token = linkToken;
        if (!token)
            throw new HubAuthError('Link di accesso non valido.', 400, 'InvalidLink');
        set({ loading: true, notice: null });
        try {
            const body = { token };
            if (config.tool)
                body.tool = config.tool;
            const data = await loginPost('otp-verify-link', body);
            if (!data?.session_token || !data.user_id) {
                throw new HubAuthError('Risposta non valida dal server.', 200, 'InvalidResponse');
            }
            linkToken = null;
            openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
            set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
            await refresh();
        }
        catch (err) {
            // Link morto (401: sconosciuto, scaduto, già usato) o accesso negato: inutile
            // riprovare, si torna al login con l'avviso. Rete, 429 e 5xx vengono lanciati
            // e il link resta valido per un nuovo tentativo.
            if (err instanceof HubAuthError) {
                const notice = err.code === 'ToolNotEnabled' ? 'tool_not_enabled'
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
        }
        finally {
            set({ loading: false });
        }
    }
    function cancelLink() {
        linkToken = null;
        set({ step: 'email', notice: null });
    }
    // ── Configurazione pubblica e registrazione ────────────────────────────────
    /** Richiesta in corso di GET /auth/tool-config: evita chiamate doppie */
    let toolConfigRequest = null;
    async function fetchToolConfig() {
        try {
            const query = config.tool ? `?tool=${encodeURIComponent(config.tool)}` : '';
            const res = await doFetch(url(`auth/tool-config${query}`));
            if (!res.ok)
                return;
            const parsed = toolConfigFromBody(await res.json().catch(() => null));
            if (parsed)
                set({ toolConfig: parsed });
        }
        catch {
            // hub non raggiungibile o non aggiornato: login senza pannello né registrazione
        }
    }
    function loadToolConfig(force = false) {
        if (state.toolConfig && !force)
            return Promise.resolve();
        if (!toolConfigRequest) {
            // .finally gira dopo l'assegnazione: la richiesta si libera sempre, anche su errore
            toolConfigRequest = fetchToolConfig().finally(() => { toolConfigRequest = null; });
        }
        return toolConfigRequest;
    }
    function startRegister() {
        if (!state.toolConfig?.signup_enabled)
            return;
        set({ step: 'register', notice: null });
    }
    async function register(data) {
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
            const body = {
                username, email, privacy_accepted: true, privacy_version: privacy.version,
            };
            if (config.tool)
                body.tool = config.tool;
            const result = await publicPost('signup', body);
            if (result?.status === 'active') {
                // Account attivo subito: hub ha già inviato il codice, si prosegue come un login
                set({ step: 'otp', pendingEmail: email, otpRequestedAt: Date.now() });
                pollSsoWhileWaiting();
            }
            else {
                set({ step: 'registered', pendingEmail: email });
            }
        }
        catch (err) {
            // Testo privacy cambiato o registrazione chiusa nel frattempo: si riallinea
            // la configurazione, così il form mostra subito il testo/stato corretto
            if (err instanceof HubAuthError && (err.code === 'PrivacyVersionMismatch' || err.code === 'SignupDisabled')) {
                void loadToolConfig(true);
            }
            throw err;
        }
        finally {
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
    async function trySso(silent = false) {
        let res;
        try {
            res = await doFetch(url('sso/session'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(config.tool ? { tool: config.tool } : {}),
            });
        }
        catch {
            // Rete assente o CORS non configurata: nessuna sessione SSO utilizzabile
            if (!silent && !state.token)
                set({ status: 'anonymous' });
            return false;
        }
        const data = (await res.json().catch(() => null));
        // Un login (OTP, link o altro) è avvenuto nel frattempo: la risposta non serve più
        if (state.token)
            return false;
        if (res.ok && data?.session_token && data.user_id) {
            openSession(data.session_token, partialUser(data.user_id, data.email ?? null));
            await refresh();
            return true;
        }
        if (!silent) {
            const error = errorFromBody(res.status, data);
            const notice = error.code === 'ToolNotEnabled' ? 'tool_not_enabled'
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
    function pollSsoWhileWaiting() {
        if (!config.sso || ssoPollAttached || typeof window === 'undefined' || typeof document === 'undefined')
            return;
        ssoPollAttached = true;
        const detach = () => {
            window.removeEventListener('focus', check);
            document.removeEventListener('visibilitychange', check);
            ssoPollAttached = false;
        };
        function check() {
            if (state.step !== 'otp' || state.token) {
                detach();
                return;
            }
            if (document.visibilityState === 'hidden' || state.loading)
                return;
            void trySso(true).then((ok) => {
                if (ok)
                    set({ step: 'email', pendingEmail: '', otpRequestedAt: null });
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
    async function adoptSession(session) {
        openSession(session.token, { ...partialUser(session.user.user_id, session.user.email ?? null), ...session.user });
        await refresh();
    }
    // ── Integrazione con i client HTTP dei progetti ────────────────────────────
    function authHeaders() {
        return state.token ? { Authorization: `Bearer ${state.token}` } : {};
    }
    async function authFetch(path, init = {}) {
        const headers = new Headers(init.headers);
        if (state.token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${state.token}`);
        }
        const res = await doFetch(url(path), { ...init, headers });
        if (res.status === 401)
            handleUnauthorized(bearerOf(headers.get('Authorization')));
        return res;
    }
    function installAxiosInterceptors(instance) {
        /** Legge un header da AxiosHeaders (axios 1.x) o da un oggetto semplice */
        const readHeader = (headers, name) => typeof headers?.get === 'function' ? headers.get(name) : headers?.[name];
        const requestId = instance.interceptors.request.use((cfg) => {
            if (!state.token)
                return cfg;
            cfg.headers = cfg.headers ?? {};
            if (!readHeader(cfg.headers, 'Authorization')) {
                if (typeof cfg.headers.set === 'function')
                    cfg.headers.set('Authorization', `Bearer ${state.token}`);
                else
                    cfg.headers.Authorization = `Bearer ${state.token}`;
            }
            return cfg;
        });
        const responseId = instance.interceptors.response.use((response) => response, (error) => {
            if (error?.response?.status === 401) {
                handleUnauthorized(bearerOf(readHeader(error.config?.headers, 'Authorization')));
            }
            return Promise.reject(error);
        });
        return () => {
            instance.interceptors.request.eject(requestId);
            instance.interceptors.response.eject(responseId);
        };
    }
    // ── Idratazione iniziale ───────────────────────────────────────────────────
    /** Applica la sessione letta dallo storage (o nessuna) e avvia la verifica */
    function boot(session, fromLegacy) {
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
        if (fromLegacy)
            persist();
        void refresh();
    }
    /** Cerca una vecchia sessione tra le legacyKeys, poi le rimuove tutte */
    function fromLegacyValues(values) {
        const found = values.map(sessionFromLegacy).find((s) => s !== null) ?? null;
        (config.legacyKeys ?? []).forEach(removeKey);
        return found;
    }
    function hydrate() {
        const legacyKeys = config.legacyKeys ?? [];
        const afterMain = (raw) => {
            const session = sessionFromStorage(raw);
            if (session || legacyKeys.length === 0)
                return boot(session, false);
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
    let ready;
    try {
        const result = hydrate();
        ready = isPromise(result) ? result.catch(() => boot(null, false)) : Promise.resolve();
    }
    catch {
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
