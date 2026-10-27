/**
 * Validazione dei dati fiscali e di indirizzo del checkout (dalla 1.17.0).
 *
 * Gli stessi algoritmi di hub (services/billing/fiscal.py): la pagina segnala l'errore
 * prima dell'invio, ma l'ultima parola resta al server. Funzioni pure, senza dipendenze.
 */
/** Le 107 sigle delle province italiane */
export declare const PROVINCES: readonly string[];
/** Testo su una riga sola, senza spazi doppi né ai bordi */
export declare function cleanText(value: string | null | undefined): string;
/** Partita IVA in forma canonica: senza spazi, punti, trattini e prefisso IT */
export declare function normalizeVat(value: string | null | undefined): string;
/** Codice fiscale in forma canonica: maiuscolo, senza spazi, punti e trattini */
export declare function normalizeTaxCode(value: string | null | undefined): string;
/** Partita IVA italiana: 11 cifre con controllo di checksum */
export declare function isValidVat(value: string | null | undefined): boolean;
/** Codice fiscale: di persona (16 caratteri) oppure di società (11 cifre) */
export declare function isValidTaxCode(value: string | null | undefined): boolean;
/** Codice fiscale personale (16 caratteri): quello che serve a un consumatore */
export declare function isValidPersonTaxCode(value: string | null | undefined): boolean;
/** CAP italiano: cinque cifre */
export declare function isValidZip(value: string | null | undefined): boolean;
/** Sigla di provincia italiana */
export declare function isValidProvince(value: string | null | undefined): boolean;
/** Codice destinatario SDI: sette caratteri alfanumerici */
export declare function isValidSdi(value: string | null | undefined): boolean;
/** Indirizzo email o PEC dalla forma plausibile */
export declare function isValidEmail(value: string | null | undefined): boolean;
