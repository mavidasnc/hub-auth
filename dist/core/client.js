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
    let state = {
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
    /** POST JSON su un endpoint pubblico di login; lancia HubAuthError sugli errori */
    async function publicPost(path, body) {
        let res;
        try {
            res = await doFetch(url(path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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
    function logout(notice) {
        // Il token va catturato prima della pulizia locale per poterlo revocare
        const token = state.token;
        forceLogout(notice);
        if (token) {
            doFetch(url('logout'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                .catch(() => undefined);
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
            await publicPost('otp-request', { email: normalized });
            set({ step: 'otp', pendingEmail: normalized, otpRequestedAt: Date.now() });
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
            const data = await publicPost('otp-verify', body);
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
            set({ status: 'anonymous' });
            return;
        }
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
        adoptSession,
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
