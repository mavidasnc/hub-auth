/**
 * Validazione dei dati fiscali e di indirizzo del checkout (dalla 1.17.0).
 *
 * Gli stessi algoritmi di hub (services/billing/fiscal.py): la pagina segnala l'errore
 * prima dell'invio, ma l'ultima parola resta al server. Funzioni pure, senza dipendenze.
 */
/** Le 107 sigle delle province italiane */
export const PROVINCES = ('AG AL AN AO AP AQ AR AT AV BA BG BI BL BN BO BR BS BT BZ CA CB CE CH CL CN CO CR CS CT CZ '
    + 'EN FC FE FG FI FM FR GE GO GR IM IS KR LC LE LI LO LT LU MB MC ME MI MN MO MS MT NA NO NU '
    + 'OR PA PC PD PE PG PI PN PO PR PT PU PV PZ RA RC RE RG RI RM RN RO SA SI SO SP SR SS SU SV '
    + 'TA TE TN TO TP TR TS TV UD VA VB VC VE VI VR VT VV').split(' ');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CF_PERSON_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
/** Valori dei caratteri in posizione dispari per il carattere di controllo del codice fiscale */
const CF_ODD = {
    '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20,
    O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
/** Testo su una riga sola, senza spazi doppi né ai bordi */
export function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
/** Partita IVA in forma canonica: senza spazi, punti, trattini e prefisso IT */
export function normalizeVat(value) {
    return String(value ?? '').replace(/[\s.-]/g, '').toUpperCase().replace(/^IT/, '');
}
/** Codice fiscale in forma canonica: maiuscolo, senza spazi, punti e trattini */
export function normalizeTaxCode(value) {
    return String(value ?? '').replace(/[\s.-]/g, '').toUpperCase();
}
/** Controllo a 11 cifre della partita IVA (Luhn adattato) */
function checksum11(digits) {
    let total = 0;
    for (let i = 0; i < digits.length; i += 1) {
        let n = digits.charCodeAt(i) - 48;
        if (i % 2 === 1) {
            n *= 2;
            if (n > 9)
                n -= 9;
        }
        total += n;
    }
    return total % 10 === 0;
}
/** Partita IVA italiana: 11 cifre con controllo di checksum */
export function isValidVat(value) {
    const v = normalizeVat(value);
    return /^\d{11}$/.test(v) && v !== '00000000000' && checksum11(v);
}
/** Codice fiscale di persona: 16 caratteri (anche con omocodia) con carattere di controllo */
function isPersonTaxCode(code) {
    if (!CF_PERSON_RE.test(code))
        return false;
    let total = 0;
    for (let i = 0; i < 15; i += 1) {
        const ch = code.charAt(i);
        if (i % 2 === 0)
            total += CF_ODD[ch] ?? 0;
        else
            total += /[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
    }
    return String.fromCharCode(65 + (total % 26)) === code.charAt(15);
}
/** Codice fiscale: di persona (16 caratteri) oppure di società (11 cifre) */
export function isValidTaxCode(value) {
    const c = normalizeTaxCode(value);
    return /^\d{11}$/.test(c) || isPersonTaxCode(c);
}
/** Codice fiscale personale (16 caratteri): quello che serve a un consumatore */
export function isValidPersonTaxCode(value) {
    return isPersonTaxCode(normalizeTaxCode(value));
}
/** CAP italiano: cinque cifre */
export function isValidZip(value) {
    return /^\d{5}$/.test(String(value ?? '').trim());
}
/** Sigla di provincia italiana */
export function isValidProvince(value) {
    return PROVINCES.includes(String(value ?? '').trim().toUpperCase());
}
/** Codice destinatario SDI: sette caratteri alfanumerici */
export function isValidSdi(value) {
    return /^[A-Z0-9]{7}$/.test(String(value ?? '').trim().toUpperCase());
}
/** Indirizzo email o PEC dalla forma plausibile */
export function isValidEmail(value) {
    return EMAIL_RE.test(String(value ?? '').trim());
}
