/**
 * Testi della UI di login.
 *
 * I default sono in italiano; ogni progetto può sovrascriverne una parte con
 * la prop `messages` (es. voicenote li prende da i18next). I segnaposto
 * {email}, {seconds} e {index} sono sostituiti da `format`.
 */
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
    notice: Record<AuthNotice, string>;
}
export declare const defaultMessages: HubAuthMessages;
/** Unisce i testi del progetto ai default (anche per le notice) */
export declare function mergeMessages(custom?: Partial<HubAuthMessages>): HubAuthMessages;
/** Sostituisce i segnaposto {nome} con i valori indicati */
export declare function format(template: string, values: Record<string, string | number>): string;
/**
 * Traduce un errore del client in un testo per l'utente.
 *
 * @param err - Errore lanciato da requestOtp / verifyOtp
 * @param messages - Testi correnti
 * @param step - Step in cui è avvenuto l'errore (per il 401 di otp-verify)
 */
export declare function errorMessage(err: unknown, messages: HubAuthMessages, step: 'email' | 'otp'): string;
