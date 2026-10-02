/**
 * Testi della UI di login.
 *
 * I default sono in italiano; ogni progetto può sovrascriverne una parte con
 * la prop `messages` (es. voicenote li prende da i18next). I segnaposto
 * {email}, {seconds} e {index} sono sostituiti da `format`.
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
  notice: Record<AuthNotice, string>;
}

export const defaultMessages: HubAuthMessages = {
  emailLabel: 'Email',
  emailPlaceholder: 'nome@esempio.com',
  sendCode: 'Invia codice',
  sending: 'Invio in corso...',
  codeHint: "Riceverai un codice di 6 cifre via email, valido per 10 minuti.",
  codeSentTo: 'Abbiamo inviato un codice a {email}',
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
  notice: {
    session_expired: 'Sessione scaduta: accedi di nuovo.',
    tool_not_enabled: 'Questo strumento non è abilitato per il tuo account.',
    trial_expired: 'Il periodo di prova è terminato.',
    link_invalid: 'Il link di accesso non è valido, è scaduto o è già stato usato. Richiedi un nuovo codice.',
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
export function errorMessage(err: unknown, messages: HubAuthMessages, step: 'email' | 'otp' | 'link'): string {
  if (!(err instanceof HubAuthError)) return messages.genericError;
  switch (err.code) {
    case 'InvalidEmail': return messages.invalidEmail;
    case 'InvalidCode': return messages.invalidCodeFormat;
    case 'NetworkError': return messages.networkError;
    case 'ToolNotEnabled': return messages.notice.tool_not_enabled;
    case 'TrialExpired': return messages.notice.trial_expired;
  }
  if (step === 'otp' && err.status === 401) return messages.invalidCode;
  // 429 e 5xx: hub restituisce un messaggio leggibile (es. "Troppi tentativi...")
  return err.status > 0 && err.message ? err.message : messages.genericError;
}
