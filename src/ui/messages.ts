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
  ckKicker: string;
  ckHeroTitle: string;
  ckHeroTitleAccent: string;
  ckHeroLead: string;
  ckHeroCta: string;
  ckHeroFaq: string;
  ckTrust1: string;
  ckTrust2: string;
  ckTrust3: string;
  ckBenefit1Title: string;
  ckBenefit1Text: string;
  ckBenefit2Title: string;
  ckBenefit2Text: string;
  ckBenefit3Title: string;
  ckBenefit3Text: string;
  ckPlansKicker: string;
  ckPlansTitle: string;
  ckPlansNoteCompany: string;
  ckPlansNotePrivate: string;
  ckRecommended: string;
  ckOrderKicker: string;
  ckOrderTitle: string;
  ckOrderLead: string;
  ckWhoTitle: string;
  ckWhoSub: string;
  ckCompany: string;
  ckCompanySub: string;
  ckPrivate: string;
  ckPrivateSub: string;
  ckDataTitle: string;
  ckDataSub: string;
  ckCompanyName: string;
  ckFirstName: string;
  ckLastName: string;
  ckVat: string;
  ckVatHint: string;
  ckTaxCode: string;
  ckOptional: string;
  ckAddressTitle: string;
  ckAddressSub: string;
  ckAddressSubManual: string;
  ckAddress: string;
  ckAddressPlaceholder: string;
  ckZip: string;
  ckCity: string;
  ckProvince: string;
  ckProvincePlaceholder: string;
  ckAddressFilled: string;
  ckSuggestions: string;
  ckPoweredByGoogle: string;
  ckInvoiceTitle: string;
  ckInvoiceSub: string;
  ckSdiNote: string;
  ckConfirmTitle: string;
  ckConfirmSub: string;
  ckConsentTerms: string;
  ckTermsLink: string;
  ckPrivacyLink: string;
  ckConsentBusiness: string;
  ckConsentImmediate: string;
  ckNoteCompany: string;
  ckNotePrivate: string;
  ckWithdrawLink: string;
  ckErrRequired: string;
  ckErrName: string;
  ckErrVat: string;
  ckErrTaxCode: string;
  ckErrTaxCodePrivate: string;
  ckErrAddress: string;
  ckErrZip: string;
  ckErrCity: string;
  ckErrProvince: string;
  ckErrSdi: string;
  ckErrPec: string;
  ckErrTerms: string;
  ckErrBusiness: string;
  ckErrImmediate: string;
  ckOkVat: string;
  ckOkTaxCode: string;
  ckOkSdi: string;
  ckOkPec: string;
  ckErrorsOne: string;
  ckErrorsMany: string;
  ckConsentLabel: string;
  ckSummaryPlan: string;
  ckNetAnnual: string;
  ckVatIncluded: string;
  ckTotalAnnual: string;
  ckTotalNote: string;
  ckOrder: string;
  ckAfterOrder: string;
  ckSecure: string;
  ckVatExcluded: string;
  ckVatIncludedBasis: string;
  ckFaqKicker: string;
  ckFaqTitle: string;
  ckFaq1Q: string;
  ckFaq1A: string;
  ckFaq2Q: string;
  ckFaq2A: string;
  ckFaq3Q: string;
  ckFaq3A: string;
  ckFaq4Q: string;
  ckFaq4A: string;
  ckFaq5Q: string;
  ckFaq5A: string;
  ckFaq6Q: string;
  ckFaq6A: string;
  ckFooterLegal: string;
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
  rememberLabel: 'Ricordami',
  rememberHint: 'Resterai connesso per i prossimi 30 giorni su questo dispositivo.',
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
  subscribePay: 'Ordina con obbligo di pagamento',
  subscribePaying: 'Reindirizzamento a PayPal...',
  subscribePreview: 'Anteprima: il pagamento è disattivato.',
  billingDisabled: 'I pagamenti non sono attivi.',
  billingUnavailable: 'Il piano scelto non è ancora disponibile.',
  paypalUnavailable: 'PayPal non è raggiungibile in questo momento. Riprova.',
  invalidSelection: 'La scelta non è valida.',
  ckKicker: 'Fleet · abbonamento annuale',
  ckHeroTitle: 'Tutti i siti WordPress dei tuoi clienti sotto controllo,',
  ckHeroTitleAccent: 'da un unico cruscotto',
  ckHeroLead: 'Aggiornamenti, monitoraggio e credenziali custodite in un unico pannello. Scegli il piano, paghi una volta all’anno e le app Mavida sono incluse per 3 mesi.',
  ckHeroCta: 'Scegli il piano',
  ckHeroFaq: 'Domande frequenti',
  ckTrust1: 'Pagamento sicuro con PayPal',
  ckTrust2: 'Fattura elettronica',
  ckTrust3: 'Un solo accesso per tutte le app',
  ckBenefit1Title: 'Un solo accesso',
  ckBenefit1Text: 'Lo stesso account per Fleet e per tutte le app Mavida: niente password da ricordare.',
  ckBenefit2Title: 'Pagamento sicuro',
  ckBenefit2Text: 'Paghi su PayPal: noi non vediamo e non conserviamo mai i dati della tua carta.',
  ckBenefit3Title: 'Fattura elettronica',
  ckBenefit3Text: 'La fattura arriva al tuo codice destinatario o alla PEC, oppure nel cassetto fiscale.',
  ckPlansKicker: 'Piani',
  ckPlansTitle: 'Scegli il tuo piano',
  ckPlansNoteCompany: 'Prezzi al mese, IVA esclusa. Il pagamento è annuale anticipato.',
  ckPlansNotePrivate: 'Prezzi al mese, IVA inclusa. Il pagamento è annuale anticipato.',
  ckRecommended: 'Consigliato',
  ckOrderKicker: 'Ordine',
  ckOrderTitle: 'I tuoi dati di fatturazione',
  ckOrderLead: 'Bastano pochi dati: li controlliamo mentre scrivi.',
  ckWhoTitle: 'Chi paga',
  ckWhoSub: 'La fattura sarà intestata a te o alla tua azienda.',
  ckCompany: 'Azienda o professionista',
  ckCompanySub: 'con partita IVA',
  ckPrivate: 'Privato',
  ckPrivateSub: 'con codice fiscale',
  ckDataTitle: 'Dati di fatturazione',
  ckDataSub: 'I campi con * sono obbligatori.',
  ckCompanyName: 'Ragione sociale',
  ckFirstName: 'Nome',
  ckLastName: 'Cognome',
  ckVat: 'Partita IVA',
  ckVatHint: '11 cifre, con o senza IT davanti.',
  ckTaxCode: 'Codice fiscale',
  ckOptional: '(facoltativo)',
  ckAddressTitle: 'Indirizzo di fatturazione',
  ckAddressSub: 'Per ora la fatturazione è solo per l’Italia. Scrivi l’indirizzo e scegli un suggerimento: compiliamo CAP, città e provincia.',
  ckAddressSubManual: 'Per ora la fatturazione è solo per l’Italia.',
  ckAddress: 'Indirizzo',
  ckAddressPlaceholder: 'Via, numero civico',
  ckZip: 'CAP',
  ckCity: 'Città',
  ckProvince: 'Provincia',
  ckProvincePlaceholder: 'Seleziona…',
  ckAddressFilled: 'Indirizzo compilato: controlla CAP e città',
  ckSuggestions: 'Suggerimenti di indirizzo',
  ckPoweredByGoogle: 'powered by Google',
  ckInvoiceTitle: 'Fattura elettronica',
  ckInvoiceSub: 'Facoltativa: ci dice dove consegnare la fattura.',
  ckSdiNote: 'Senza codice destinatario né PEC la fattura parte con il codice 0000000 e la trovi nel cassetto fiscale dell’Agenzia delle Entrate.',
  ckConfirmTitle: 'Conferma l’ordine',
  ckConfirmSub: 'Prima di pagare, due conferme.',
  ckConsentTerms: 'Ho letto e accetto i {terms} e l’{privacy}.',
  ckTermsLink: 'Termini di vendita',
  ckPrivacyLink: 'Informativa sulla privacy',
  ckConsentBusiness: 'Dichiaro di acquistare per scopi connessi alla mia attività imprenditoriale o professionale e prendo atto che non si applicano le tutele previste per i consumatori.',
  ckConsentImmediate: 'Chiedo espressamente che il servizio inizi subito. So che, se recedo entro {days} giorni, pagherò la parte di servizio già usufruita.',
  ckNoteCompany: 'Per i contratti con aziende e professionisti non si applica il diritto di recesso previsto per i consumatori. Dopo il pagamento ricevi la conferma d’ordine via email.',
  ckNotePrivate: 'Come consumatore hai {days} giorni dall’inizio del servizio per recedere dal contratto senza dare spiegazioni, online dalla pagina {withdraw}. Ti mandiamo il link anche nell’email di conferma.',
  ckWithdrawLink: 'Recedi dal contratto',
  ckErrRequired: 'Campo obbligatorio',
  ckErrName: 'Inserisci almeno 2 caratteri',
  ckErrVat: 'Partita IVA non valida: servono 11 cifre e il controllo non torna',
  ckErrTaxCode: 'Codice fiscale non valido: controlla i 16 caratteri (o le 11 cifre di una società)',
  ckErrTaxCodePrivate: 'Per un privato serve il codice fiscale personale di 16 caratteri',
  ckErrAddress: 'Indica via e numero civico',
  ckErrZip: 'Il CAP ha 5 cifre',
  ckErrCity: 'Inserisci la città',
  ckErrProvince: 'Scegli la provincia',
  ckErrSdi: 'Il codice destinatario ha 7 caratteri (lettere e cifre)',
  ckErrPec: 'Indirizzo PEC non valido',
  ckErrTerms: 'Per ordinare devi accettare i termini di vendita e la privacy',
  ckErrBusiness: 'Conferma che l’acquisto è per scopi professionali',
  ckErrImmediate: 'Conferma la richiesta di avvio immediato del servizio',
  ckOkVat: 'Partita IVA valida',
  ckOkTaxCode: 'Codice fiscale valido',
  ckOkSdi: 'Codice destinatario valido',
  ckOkPec: 'PEC valida',
  ckErrorsOne: 'Controlla 1 punto prima di ordinare:',
  ckErrorsMany: 'Controlla {count} punti prima di ordinare:',
  ckConsentLabel: 'Consenso',
  ckSummaryPlan: 'Prezzo di lancio',
  ckNetAnnual: 'Imponibile annuale',
  ckVatIncluded: 'di cui IVA {rate}%',
  ckTotalAnnual: 'Totale annuale',
  ckTotalNote: 'Il totale comprende l’IVA. Pagamento annuale anticipato.',
  ckOrder: 'Ordina con obbligo di pagamento',
  ckAfterOrder: 'Dopo l’ordine ti portiamo su PayPal per pagare.',
  ckSecure: 'Pagamento sicuro: non vediamo mai i dati della tua carta.',
  ckVatExcluded: 'IVA esclusa',
  ckVatIncludedBasis: 'IVA inclusa',
  ckFaqKicker: 'FAQ',
  ckFaqTitle: 'Domande frequenti',
  ckFaq1Q: 'I prezzi comprendono l’IVA?',
  ckFaq1A: 'Se acquisti come azienda o professionista i prezzi dei piani sono IVA esclusa: nel riepilogo vedi imponibile, IVA e totale. Se acquisti come privato i prezzi che vedi comprendono già l’IVA.',
  ckFaq2Q: 'Posso recedere dal contratto?',
  ckFaq2A: 'Se acquisti come privato hai {days} giorni dall’inizio del servizio per recedere, online dalla pagina «Recedi dal contratto». Se hai chiesto di iniziare subito, ti restituiamo il prezzo meno la parte già usufruita. Per aziende e professionisti il diritto di recesso previsto per i consumatori non si applica.',
  ckFaq3Q: 'Come ricevo la fattura?',
  ckFaq3A: 'La fattura è elettronica: la inviamo al codice destinatario o alla PEC che indichi. Se non ne hai, la trovi nel cassetto fiscale dell’Agenzia delle Entrate.',
  ckFaq4Q: 'Cosa sono le app incluse?',
  ckFaq4A: 'Con un piano Fleet ricevi le app Mavida (VoiceNote, Wandly, Slide-orama, Social Planner, WooSync) incluse per un periodo, senza costi in più.',
  ckFaq5Q: 'Cosa succede dopo il pagamento?',
  ckFaq5A: 'Il tuo abbonamento si attiva subito e ricevi via email la conferma d’ordine, con i dati del contratto e, per i privati, il link per recedere.',
  ckFaq6Q: 'Come pago?',
  ckFaq6A: 'Con PayPal, in modo sicuro: puoi usare il tuo saldo o una carta. Il pagamento è annuale e anticipato.',
  ckFooterLegal: 'Informazioni legali',
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
