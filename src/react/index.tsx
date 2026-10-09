/**
 * @mavida/hub-auth/react — binding React del client
 *
 * - <HubAuthProvider client={...}> rende il client disponibile all'albero
 * - useHubAuth() restituisce stato e azioni, aggiornandosi ad ogni cambio
 *   (useSyncExternalStore: compatibile con React 18 e 19, niente store esterni)
 * - <AuthGate> sostituisce le guardie scritte a mano in App: loading durante
 *   la verifica, login se anonimo, accesso negato se il ruolo non basta
 */

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AuthState, HubAuthClient } from '../core/index.js';

const HubAuthContext = createContext<HubAuthClient | null>(null);

/** Provider del client di autenticazione */
export function HubAuthProvider({ client, children }: { client: HubAuthClient; children: ReactNode }) {
  return <HubAuthContext.Provider value={client}>{children}</HubAuthContext.Provider>;
}

/** Client del provider più vicino (lancia un errore se manca il provider) */
export function useHubAuthClient(): HubAuthClient {
  const client = useContext(HubAuthContext);
  if (!client) throw new Error('useHubAuth: manca <HubAuthProvider> sopra questo componente');
  return client;
}

/** Stato e azioni di autenticazione */
export type UseHubAuthResult = AuthState & {
  client: HubAuthClient;
  isLoggedIn: boolean;
  requestOtp: HubAuthClient['requestOtp'];
  verifyOtp: HubAuthClient['verifyOtp'];
  verifyLink: HubAuthClient['verifyLink'];
  cancelLink: HubAuthClient['cancelLink'];
  resetToEmail: HubAuthClient['resetToEmail'];
  loadToolConfig: HubAuthClient['loadToolConfig'];
  startRegister: HubAuthClient['startRegister'];
  register: HubAuthClient['register'];
  refresh: HubAuthClient['refresh'];
  logout: HubAuthClient['logout'];
};

/** Hook principale: stato reattivo della sessione e azioni del client */
export function useHubAuth(): UseHubAuthResult {
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
    loadToolConfig: client.loadToolConfig,
    startRegister: client.startRegister,
    register: client.register,
    refresh: client.refresh,
    logout: client.logout,
  };
}

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
export function AuthGate({ children, fallback, loading = null, requireRole, denied = null }: AuthGateProps) {
  const { status, user } = useHubAuth();
  if (status === 'checking') return <>{loading}</>;
  if (status === 'anonymous') return <>{fallback}</>;
  if (requireRole && user?.role !== requireRole) return <>{denied}</>;
  return <>{children}</>;
}
