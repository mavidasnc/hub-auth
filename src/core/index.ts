/**
 * @mavida/hub-auth — core headless (nessuna dipendenza da React)
 */

export { createHubAuth } from './client.js';
export type {
  AddressDetails, AddressSuggestion, AuthNotice, AuthState, AuthStatus, AuthStep, AxiosLike,
  BillingApp, BillingCatalog, BillingLegal, BillingOrder, BillingPlan, BillingQuote, BillingSelection,
  BillingType, HubAuthClient, HubAuthConfig, HubUser, RegisterData, ToolConfig,
} from './client.js';
export { HubAuthError, isHubAuthErrorCode, errorFromBody, fieldErrorsFromDetail } from './errors.js';
export type { FieldError, HubErrorBody } from './errors.js';
export {
  PROVINCES, cleanText, isValidEmail, isValidPersonTaxCode, isValidProvince, isValidSdi, isValidTaxCode,
  isValidVat, isValidZip, normalizeTaxCode, normalizeVat,
} from './fiscal.js';
export { localStorageAdapter, memoryStorageAdapter } from './storage.js';
export type { StorageAdapter } from './storage.js';
