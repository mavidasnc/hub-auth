/**
 * Testi della UI di login.
 *
 * I default sono in italiano; ogni progetto può sovrascriverne una parte con
 * la prop `messages` (es. voicenote li prende da i18next). I segnaposto
 * {email}, {seconds}, {index} e {days} sono sostituiti da `format`; {link} di
 * `privacyLabel` diventa il pulsante che apre l'informativa (testo `privacyLinkText`).
 */
import type { AuthNotice } from '../core/index.js';
export interface HubAuthMessages {
    emailLabel: string;
    emailPlaceholder: string;
    sendCode: string;
    sending: string;
    codeHint: string;
    rememberLabel: string;
    rememberHint: string;
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
export declare const defaultMessages: HubAuthMessages;
/** Unisce i testi del progetto ai default (anche per le notice) */
export declare function mergeMessages(custom?: Partial<HubAuthMessages>): HubAuthMessages;
/** Sostituisce i segnaposto {nome} con i valori indicati */
export declare function format(template: string, values: Record<string, string | number>): string;
/**
 * Traduce un errore del client in un testo per l'utente.
 *
 * @param err - Errore lanciato da requestOtp / verifyOtp / verifyLink
 * @param messages - Testi correnti
 * @param step - Step in cui è avvenuto l'errore (per il 401 di otp-verify)
 */
export declare function errorMessage(err: unknown, messages: HubAuthMessages, step: 'email' | 'otp' | 'link' | 'register' | 'subscribe'): string;
