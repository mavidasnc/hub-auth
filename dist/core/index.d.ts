/**
 * @mavida/hub-auth — core headless (nessuna dipendenza da React)
 */
export { createHubAuth } from './client.js';
export type { AuthNotice, AuthState, AuthStatus, AuthStep, AxiosLike, HubAuthClient, HubAuthConfig, HubUser, RegisterData, ToolConfig, } from './client.js';
export { HubAuthError, isHubAuthErrorCode, errorFromBody } from './errors.js';
export type { HubErrorBody } from './errors.js';
export { localStorageAdapter, memoryStorageAdapter } from './storage.js';
export type { StorageAdapter } from './storage.js';
