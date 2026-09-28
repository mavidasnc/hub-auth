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

/** Forma del body di errore restituito da hub */
export interface HubErrorBody {
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Errore di una chiamata verso hub.
 *
 * - status: codice HTTP (0 se la richiesta non è partita, es. rete assente)
 * - code: codice applicativo hub (es. 'ToolNotEnabled', 'TrialExpired'), null se assente
 * - details: campo `details` del body hub, null se assente
 */
export class HubAuthError extends Error {
  status: number;
  code: string | null;
  details: Record<string, unknown> | null;

  constructor(message: string, status: number, code: string | null = null,
              details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'HubAuthError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Verifica se un errore è un HubAuthError con un determinato codice hub.
 *
 * @param err - Errore da verificare
 * @param code - Codice atteso (es. 'ToolNotEnabled')
 */
export function isHubAuthErrorCode(err: unknown, code: string): err is HubAuthError {
  return err instanceof HubAuthError && err.code === code;
}

/**
 * Costruisce un HubAuthError dal body di errore di hub.
 *
 * @param status - Codice HTTP della risposta
 * @param body - Body JSON già deserializzato (null se assente o non JSON)
 */
export function errorFromBody(status: number, body: HubErrorBody | null): HubAuthError {
  const rawError = typeof body?.error === 'string' ? body.error : null;
  // Un valore con spazi è un messaggio leggibile, non un codice
  const code = rawError && !/\s/.test(rawError) ? rawError : null;
  const message = body?.message || (code ? null : rawError) || `Errore ${status}`;
  return new HubAuthError(message, status, code, body?.details ?? null);
}

/**
 * Errore di rete (richiesta non partita o risposta mai arrivata): status 0.
 *
 * @param err - Eccezione lanciata da fetch
 */
export function networkError(err: unknown): HubAuthError {
  return new HubAuthError(err instanceof Error ? err.message : 'Errore di rete', 0, 'NetworkError');
}
