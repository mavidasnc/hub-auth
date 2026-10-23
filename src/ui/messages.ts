/**
 * Testi della UI di login.
 *
 * I default sono in italiano; ogni progetto può sovrascriverne una parte con
 * la prop `messages` (es. voicenote li prende da i18next). I segnaposto
 * {email}, {seconds}, {index} e {days} sono sostituiti da `format`; {link} di
 * `privacyLabel` diventa il pulsante che apre l'informativa (testo `privacyLinkText`).
 */

import { HubAuthError } from '../core/index.js';
import type { AuthNotice } from '../core/index.js';

export interface HubAuthMessages {
  emailLabel: string;
  emailPlaceholder: string;
  sendCode: string;
  sending: string;
  codeHint: string;
  codeSentTo: string;
  digitLabel: string;
  verify: string;
  verifying: string;
  changeEmail: string;
  resend: string;
  resendIn: string;
  resent: string;
  invalidEmail: string;
  invalidCodeFormat: string;
  invalidCode: string;
  networkError: string;
  genericError: string;
  linkIntro: string;
  linkConfirm: string;
  linkSigning: string;
  linkUseCode: string;
  signupLink: string;
  signupTrialLink: string;
  signupTrialLinkOne: string;
  loginLink: string;
  registerTitle: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  privacyTitle: string;
  privacyLabel: string;
  privacyLinkText: string;
  privacyOpen: string;
  privacyClose: string;
  privacyAccept: string;
  register: string;
  registering: string;
  invalidUsername: string;
  privacyRequired: string;
  signupDisabled: string;
  privacyChanged: string;
  couponToggle: string;
  couponLabel: string;
  couponPlaceholder: string;
  invalidCoupon: string;
  aboutLoading: string;
  aboutClose: string;
  registeredTitle: string;
  registeredText: string;
  backToLogin: string;
  subscribeTitle: string;
  subscribeIntro: string;
  subscribeLoading: string;
  subscribeUnavailable: string;
  subscribePlans: string;
  subscribeNoFleet: string;
  subscribeSites: string;
  subscribePerMonth: string;
  subscribePerYearPrice: string;
  subscribeListPrice: string;
  subscribeAppsIncluded: string;
  subscribeApps: string;
  subscribeLaunch: string;
  subscribeSummary: string;
  subscribeNet: string;
  subscribeVat: string;
  subscribeTotal: string;
  subscribePerYear: string;
  subscribeNeedSelection: string;
  subscribeNeedPlan: string;
  subscribeBilling: string;
  billingNameLabel: string;
  vatNumberLabel: string;
  taxCodeLabel: string;
  sdiCodeLabel: string;
  pecLabel: string;
  countryLabel: string;
  fiscalRequired: string;
  subscribePay: string;
  subscribePaying: string;
  subscribePreview: string;
  billingDisabled: string;
  billingUnavailable: string;
  paypalUnavailable: string;
  invalidSelection: string;
  ecosystemTitle: string;
  ecosystemMenu: string;
  notice: Record<AuthNotice, string>;
}

export const defaultMessages: HubAuthMessages = {
  emailLabel: 'Email',
  emailPlaceholder: 'nome@esempio.com',
  sendCode: 'Invia codice',
  sending: 'Invio in corso...',
  codeHint: "Riceverai un codice di 6 cifre via email, valido per 10 minuti.",
  codeSentTo: 'Se {email} è registrato, riceverai un codice via email.',
  digitLabel: 'Cifra {index} del codice',
  verify: 'Verifica codice',
  verifying: 'Verifica in corso...',
  changeEmail: 'Cambia email',
  resend: 'Reinvia codice',
  resendIn: 'Reinvia tra {seconds}s',
  resent: 'Nuovo codice inviato.',
  invalidEmail: 'Inserisci un indirizzo email valido.',
  invalidCodeFormat: 'Il codice deve essere di 6 cifre.',
  invalidCode: 'Codice non valido o scaduto.',
  networkError: 'Impossibile contattare il server. Controlla la connessione e riprova.',
  genericError: 'Si è verificato un errore. Riprova.',
  linkIntro: "Hai aperto il link di accesso ricevuto via email. Vuoi entrare?",
  linkConfirm: 'Accedi',
  linkSigning: 'Accesso in corso...',
  linkUseCode: 'Usa il codice invece',
  signupLink: 'Non hai un account? Registrati',
  signupTrialLink: 'Registrati e prova gratis per {days} giorni',
  signupTrialLinkOne: 'Registrati e prova gratis per 1 giorno',
  loginLink: 'Hai già un account? Accedi',
  registerTitle: 'Crea il tuo account',
  usernameLabel: 'Nome utente',
  usernamePlaceholder: 'Mario Rossi',
  privacyTitle: 'Informativa sulla privacy',
  privacyLabel: "Ho letto e accetto l'{link}",
  privacyLinkText: 'informativa sulla privacy',
  privacyOpen: "Visualizza il testo completo dell'informativa",
  privacyClose: 'Chiudi',
  privacyAccept: "Accetto l'informativa",
  register: 'Registrati',
  registering: 'Registrazione in corso...',
  invalidUsername: 'Inserisci un nome utente di almeno 2 caratteri.',
  privacyRequired: "Per registrarti devi accettare l'informativa sulla privacy.",
  signupDisabled: 'La registrazione non è al momento disponibile.',
  privacyChanged: "L'informativa sulla privacy è stata aggiornata: rileggila e riprova.",
  couponToggle: 'Hai un coupon?',
  couponLabel: 'Coupon',
  couponPlaceholder: 'Codice coupon',
  invalidCoupon: 'Coupon non valido',
  aboutLoading: 'Caricamento...',
  aboutClose: 'Chiudi',
  registeredTitle: 'Registrazione ricevuta',
  registeredText: 'Grazie! Abbiamo registrato la tua richiesta per {email}. Riceverai una email appena il tuo account sarà attivato.',
  backToLogin: "Torna all'accesso",
  subscribeTitle: 'Scegli il tuo abbonamento',
  subscribeIntro: "Per usare questo servizio serve un abbonamento annuale. Il pagamento avviene su PayPal, in modo sicuro.",
  subscribeLoading: 'Caricamento del listino...',
  subscribeUnavailable: 'I pagamenti non sono al momento disponibili. Riprova più tardi.',
  subscribePlans: 'Piano Fleet',
  subscribeNoFleet: 'Solo le app, senza Fleet',
  subscribeSites: 'fino a {sites} siti',
  subscribePerMonth: '{price} al mese',
  subscribePerYearPrice: '{price} all\'anno',
  subscribeListPrice: 'Listino {price}',
  subscribeAppsIncluded: 'Con un piano Fleet le app Mavida sono incluse per {period}.',
  subscribeApps: 'App',
  subscribeLaunch: 'Prezzo di lancio valido fino al {date}',
  subscribeSummary: 'Riepilogo',
  subscribeNet: 'Imponibile',
  subscribeVat: 'IVA {rate}%',
  subscribeTotal: 'Totale',
  subscribePerYear: 'Pagamento annuale anticipato',
  subscribeNeedSelection: "Scegli un piano o almeno un'app.",
  subscribeNeedPlan: 'Scegli un piano.',
  subscribeBilling: 'Dati di fatturazione',
  billingNameLabel: 'Ragione sociale o nome e cognome',
  vatNumberLabel: 'Partita IVA',
  taxCodeLabel: 'Codice fiscale',
  sdiCodeLabel: 'Codice SDI',
  pecLabel: 'PEC',
  countryLabel: 'Paese (codice a due lettere)',
  fiscalRequired: 'Indica la partita IVA o il codice fiscale.',
  subscribePay: 'Paga con PayPal',
  subscribePaying: 'Reindirizzamento a PayPal...',
  subscribePreview: 'Anteprima: il pagamento è disattivato.',
  billingDisabled: 'I pagamenti non sono attivi.',
  billingUnavailable: 'Il piano scelto non è ancora disponibile.',
  paypalUnavailable: 'PayPal non è raggiungibile in questo momento. Riprova.',
  invalidSelection: 'La scelta non è valida.',
  ecosystemTitle: 'Le altre app Mavida',
  ecosystemMenu: 'App Mavida',
  notice: {
    session_expired: 'Sessione scaduta: accedi di nuovo.',
    tool_not_enabled: 'Questo strumento non è abilitato per il tuo account.',
    trial_expired: 'Il periodo di prova è terminato.',
    link_invalid: 'Il link di accesso non è valido, è scaduto o è già stato usato. Richiedi un nuovo codice.',
    coupon_invalid: 'Coupon non valido',
    subscription_required: 'Il tuo abbonamento è scaduto o non è ancora attivo: accedi di nuovo per rinnovarlo.',
    payment_received: 'Pagamento ricevuto. Accedi con il tuo indirizzo email per iniziare.',
    payment_pending: 'Pagamento in elaborazione: tra qualche minuto potrai accedere.',
    payment_failed: 'Il pagamento non è stato completato. Se hai già pagato attendi qualche minuto e riprova ad accedere.',
  },
};

/** Unisce i testi del progetto ai default (anche per le notice) */
export function mergeMessages(custom?: Partial<HubAuthMessages>): HubAuthMessages {
  return {
    ...defaultMessages,
    ...custom,
    notice: { ...defaultMessages.notice, ...custom?.notice },
  };
}

/** Sostituisce i segnaposto {nome} con i valori indicati */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match);
}

/**
 * Traduce un errore del client in un testo per l'utente.
 *
 * @param err - Errore lanciato da requestOtp / verifyOtp / verifyLink
 * @param messages - Testi correnti
 * @param step - Step in cui è avvenuto l'errore (per il 401 di otp-verify)
 */
export function errorMessage(err: unknown, messages: HubAuthMessages, step: 'email' | 'otp' | 'link' | 'register' | 'subscribe'): string {
  if (!(err instanceof HubAuthError)) return messages.genericError;
  switch (err.code) {
    case 'InvalidEmail': return messages.invalidEmail;
    case 'InvalidCode': return messages.invalidCodeFormat;
    case 'NetworkError': return messages.networkError;
    case 'ToolNotEnabled': return messages.notice.tool_not_enabled;
    case 'TrialExpired': return messages.notice.trial_expired;
    case 'InvalidUsername': return messages.invalidUsername;
    case 'PrivacyNotAccepted': return messages.privacyRequired;
    case 'SignupDisabled': return messages.signupDisabled;
    case 'PrivacyVersionMismatch': return messages.privacyChanged;
    case 'InvalidCoupon': return messages.invalidCoupon;
    case 'SubscriptionRequired': return messages.notice.subscription_required;
    case 'BillingDisabled': return messages.billingDisabled;
    case 'BillingNotConfigured':
    case 'PlanNotMapped': return messages.billingUnavailable;
    case 'PayPalUnavailable': return messages.paypalUnavailable;
    case 'InvalidSelection':
    case 'InvalidPlan': return messages.invalidSelection;
  }
  if (step === 'otp' && err.status === 401) return messages.invalidCode;
  // 429 e 5xx: hub restituisce un messaggio leggibile (es. "Troppi tentativi...")
  return err.status > 0 && err.message ? err.message : messages.genericError;
}
