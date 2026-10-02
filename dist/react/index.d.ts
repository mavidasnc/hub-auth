/**
 * @mavida/hub-auth/react — binding React del client
 *
 * - <HubAuthProvider client={...}> rende il client disponibile all'albero
 * - useHubAuth() restituisce stato e azioni, aggiornandosi ad ogni cambio
 *   (useSyncExternalStore: compatibile con React 18 e 19, niente store esterni)
 * - <AuthGate> sostituisce le guardie scritte a mano in App: loading durante
 *   la verifica, login se anonimo, accesso negato se il ruolo non basta
 */
import { type ReactNode } from 'react';
import type { AuthState, HubAuthClient } from '../core/index.js';
/** Provider del client di autenticazione */
export declare function HubAuthProvider({ client, children }: {
    client: HubAuthClient;
    children: ReactNode;
}): import("react").JSX.Element;
/** Client del provider più vicino (lancia un errore se manca il provider) */
export declare function useHubAuthClient(): HubAuthClient;
/** Stato e azioni di autenticazione */
export type UseHubAuthResult = AuthState & {
    client: HubAuthClient;
    isLoggedIn: boolean;
    requestOtp: HubAuthClient['requestOtp'];
    verifyOtp: HubAuthClient['verifyOtp'];
    verifyLink: HubAuthClient['verifyLink'];
    cancelLink: HubAuthClient['cancelLink'];
    resetToEmail: HubAuthClient['resetToEmail'];
    refresh: HubAuthClient['refresh'];
    logout: HubAuthClient['logout'];
};
/** Hook principale: stato reattivo della sessione e azioni del client */
export declare function useHubAuth(): UseHubAuthResult;
/** Props di AuthGate */
export interface AuthGateProps {
    /** Contenuto protetto */
    children: ReactNode;
    /** Schermata di login (utente anonimo) */
    fallback: ReactNode;
    /** Mostrato durante la verifica della sessione (default: nulla) */
    loading?: ReactNode;
    /** Ruolo richiesto (es. 'admin'); se l'utente ha un altro ruolo si mostra `denied` */
    requireRole?: string;
    /** Mostrato se il ruolo non basta (default: nulla) */
    denied?: ReactNode;
}
/** Guardia di autenticazione (e ruolo) */
export declare function AuthGate({ children, fallback, loading, requireRole, denied }: AuthGateProps): import("react").JSX.Element;
