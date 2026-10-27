/**
 * @mavida/hub-auth — core headless (nessuna dipendenza da React)
 */
export { createHubAuth } from './client.js';
export { HubAuthError, isHubAuthErrorCode, errorFromBody, fieldErrorsFromDetail } from './errors.js';
export { PROVINCES, cleanText, isValidEmail, isValidPersonTaxCode, isValidProvince, isValidSdi, isValidTaxCode, isValidVat, isValidZip, normalizeTaxCode, normalizeVat, } from './fiscal.js';
export { localStorageAdapter, memoryStorageAdapter } from './storage.js';
