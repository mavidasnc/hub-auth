import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @mavida/hub-auth/react — binding React del client
 *
 * - <HubAuthProvider client={...}> rende il client disponibile all'albero
 * - useHubAuth() restituisce stato e azioni, aggiornandosi ad ogni cambio
 *   (useSyncExternalStore: compatibile con React 18 e 19, niente store esterni)
 * - <AuthGate> sostituisce le guardie scritte a mano in App: loading durante
 *   la verifica, login se anonimo, accesso negato se il ruolo non basta
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
const HubAuthContext = createContext(null);
/** Provider del client di autenticazione */
export function HubAuthProvider({ client, children }) {
    return _jsx(HubAuthContext.Provider, { value: client, children: children });
}
/** Client del provider più vicino (lancia un errore se manca il provider) */
export function useHubAuthClient() {
    const client = useContext(HubAuthContext);
    if (!client)
        throw new Error('useHubAuth: manca <HubAuthProvider> sopra questo componente');
    return client;
}
/** Hook principale: stato reattivo della sessione e azioni del client */
export function useHubAuth() {
    const client = useHubAuthClient();
    const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
    return {
        ...state,
        client,
        isLoggedIn: state.status === 'authenticated',
        requestOtp: client.requestOtp,
        verifyOtp: client.verifyOtp,
        verifyLink: client.verifyLink,
        cancelLink: client.cancelLink,
        resetToEmail: client.resetToEmail,
        refresh: client.refresh,
        logout: client.logout,
    };
}
/** Guardia di autenticazione (e ruolo) */
export function AuthGate({ children, fallback, loading = null, requireRole, denied = null }) {
    const { status, user } = useHubAuth();
    if (status === 'checking')
        return _jsx(_Fragment, { children: loading });
    if (status === 'anonymous')
        return _jsx(_Fragment, { children: fallback });
    if (requireRole && user?.role !== requireRole)
        return _jsx(_Fragment, { children: denied });
    return _jsx(_Fragment, { children: children });
}
