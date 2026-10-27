/**
 * Errori HTTP verso hub, normalizzati in un'unica forma.
 *
 * hub non è uniforme nel body di errore: alcuni endpoint mettono un codice
 * applicativo in `error` e il testo in `message` (es. 403
 * {"error": "ToolNotEnabled", "message": "..."}), altri mettono direttamente
 * il testo in `error` (es. otp-verify 401 {"error": "Codice non valido o scaduto."})
 * o solo in `message` (otp-request). Regola: un `error` con spazi è un messaggio,
 * senza spazi è un codice.
 */
/** Estrae gli errori di campo dal `detail` di una risposta 400 di hub (vuoto se non ce ne sono) */
export function fieldErrorsFromDetail(detail) {
    if (!Array.isArray(detail))
        return [];
    const result = [];
    for (const item of detail) {
        const entry = item;
        const field = Array.isArray(entry?.loc) ? String(entry?.loc[0] ?? '') : '';
        // pydantic antepone «Value error, » ai messaggi dei validatori: si toglie
        const message = typeof entry?.msg === 'string' ? entry.msg.replace(/^Value error,\s*/, '') : '';
        if (field && message)
            result.push({ field, message });
    }
    return result;
}
/**
 * Errore di una chiamata verso hub.
 *
 * - status: codice HTTP (0 se la richiesta non è partita, es. rete assente)
 * - code: codice applicativo hub (es. 'ToolNotEnabled', 'TrialExpired'), null se assente
 * - details: campo `details` del body hub, null se assente
 * - fieldErrors: errori di campo di una validazione fallita (400 ValidationError), vuoto altrimenti
 */
export class HubAuthError extends Error {
    constructor(message, status, code = null, details = null, fieldErrors = []) {
        super(message);
        this.name = 'HubAuthError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.fieldErrors = fieldErrors;
    }
}
/**
 * Verifica se un errore è un HubAuthError con un determinato codice hub.
 *
 * @param err - Errore da verificare
 * @param code - Codice atteso (es. 'ToolNotEnabled')
 */
export function isHubAuthErrorCode(err, code) {
    return err instanceof HubAuthError && err.code === code;
}
/**
 * Costruisce un HubAuthError dal body di errore di hub.
 *
 * @param status - Codice HTTP della risposta
 * @param body - Body JSON già deserializzato (null se assente o non JSON)
 */
export function errorFromBody(status, body) {
    const rawError = typeof body?.error === 'string' ? body.error : null;
    // Un valore con spazi è un messaggio leggibile, non un codice
    const code = rawError && !/\s/.test(rawError) ? rawError : null;
    const message = body?.message || (code ? null : rawError) || `Errore ${status}`;
    return new HubAuthError(message, status, code, body?.details ?? null, fieldErrorsFromDetail(body?.detail));
}
/**
 * Errore di rete (richiesta non partita o risposta mai arrivata): status 0.
 *
 * @param err - Eccezione lanciata da fetch
 */
export function networkError(err) {
    return new HubAuthError(err instanceof Error ? err.message : 'Errore di rete', 0, 'NetworkError');
}
