/**
 * @mavida/hub-auth — core headless (nessuna dipendenza da React)
 */
export { createHubAuth } from './client.js';
export { HubAuthError, isHubAuthErrorCode, errorFromBody } from './errors.js';
export { localStorageAdapter, memoryStorageAdapter } from './storage.js';
