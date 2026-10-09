/**
 * Testi della UI di login.
 *
 * I default sono in italiano; ogni progetto può sovrascriverne una parte con
 * la prop `messages` (es. voicenote li prende da i18next). I segnaposto
 * {email}, {seconds} e {index} sono sostituiti da `format`; {link} di
 * `privacyLabel` diventa il pulsante che apre l'informativa (testo `privacyLinkText`).
 */
import { HubAuthError } from '../core/index.js';
export const defaultMessages = {
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
    registeredTitle: 'Registrazione ricevuta',
    registeredText: 'Grazie! Abbiamo registrato la tua richiesta per {email}. Riceverai una email appena il tuo account sarà attivato.',
    backToLogin: "Torna all'accesso",
    ecosystemTitle: 'Le altre app Mavida',
    ecosystemMenu: 'App Mavida',
    notice: {
        session_expired: 'Sessione scaduta: accedi di nuovo.',
        tool_not_enabled: 'Questo strumento non è abilitato per il tuo account.',
        trial_expired: 'Il periodo di prova è terminato.',
        link_invalid: 'Il link di accesso non è valido, è scaduto o è già stato usato. Richiedi un nuovo codice.',
    },
};
/** Unisce i testi del progetto ai default (anche per le notice) */
export function mergeMessages(custom) {
    return {
        ...defaultMessages,
        ...custom,
        notice: { ...defaultMessages.notice, ...custom?.notice },
    };
}
/** Sostituisce i segnaposto {nome} con i valori indicati */
export function format(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match);
}
/**
 * Traduce un errore del client in un testo per l'utente.
 *
 * @param err - Errore lanciato da requestOtp / verifyOtp / verifyLink
 * @param messages - Testi correnti
 * @param step - Step in cui è avvenuto l'errore (per il 401 di otp-verify)
 */
export function errorMessage(err, messages, step) {
    if (!(err instanceof HubAuthError))
        return messages.genericError;
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
    }
    if (step === 'otp' && err.status === 401)
        return messages.invalidCode;
    // 429 e 5xx: hub restituisce un messaggio leggibile (es. "Troppi tentativi...")
    return err.status > 0 && err.message ? err.message : messages.genericError;
}
