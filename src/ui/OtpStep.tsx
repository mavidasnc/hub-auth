/**
 * Secondo passo del login: inserimento del codice OTP.
 *
 * - invio con Enter, con il pulsante o automatico alla sesta cifra, senza
 *   doppi invii dello stesso codice
 * - reinvio del codice con cooldown e conto alla rovescia
 * - "cambia email" per tornare al primo passo
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useHubAuth } from '../react/index.js';
import { OtpInput } from './OtpInput.js';
import { errorMessage, format, mergeMessages, type HubAuthMessages } from './messages.js';

const CODE_LENGTH = 6;

export interface OtpStepProps {
  messages?: Partial<HubAuthMessages>;
  /** Secondi di attesa prima di poter reinviare il codice (default 60) */
  resendCooldown?: number;
  /** Mostra il link "Registrati" quando hub offre la registrazione (default true) */
  signup?: boolean;
}

/** Secondi mancanti al reinvio, aggiornati ogni secondo */
function useCooldown(since: number | null, seconds: number): number {
  const compute = () => (since ? Math.max(0, Math.ceil(seconds - (Date.now() - since) / 1000)) : 0);
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    if (!since) return undefined;
    const timer = setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
    // compute dipende solo da since e seconds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, seconds]);

  return remaining;
}

export function OtpStep({ messages: custom, resendCooldown = 60, signup = true }: OtpStepProps) {
  const messages = mergeMessages(custom);
  const {
    verifyOtp, requestOtp, resetToEmail, startRegister, pendingEmail, otpRequestedAt, toolConfig, loading,
  } = useHubAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Ultimo codice inviato: evita il doppio invio (auto-submit + pulsante/Enter)
  const lastSubmitted = useRef<string | null>(null);
  const remaining = useCooldown(otpRequestedAt, resendCooldown);

  /** Invia il codice a hub, una sola volta per valore */
  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH) {
      setError(messages.invalidCodeFormat);
      return;
    }
    if (loading || lastSubmitted.current === value) return;
    lastSubmitted.current = value;
    setError('');
    setInfo('');
    try {
      await verifyOtp(value);
    } catch (err) {
      setError(errorMessage(err, messages, 'otp'));
      setCode('');
      lastSubmitted.current = null;
    }
  };

  /** Handler: modifica del codice, con invio automatico alla sesta cifra */
  const handleChange = (value: string) => {
    setCode(value);
    if (value.length < CODE_LENGTH) lastSubmitted.current = null;
    if (value.length === CODE_LENGTH) void submit(value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(code);
  };

  /** Handler: reinvio del codice alla stessa email */
  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await requestOtp(pendingEmail);
      setCode('');
      lastSubmitted.current = null;
      setInfo(messages.resent);
    } catch (err) {
      setError(errorMessage(err, messages, 'email'));
    }
  };

  return (
    <form className="hub-auth__form" onSubmit={handleSubmit}>
      <p className="hub-auth__text">
        {format(messages.codeSentTo, { email: pendingEmail })}
      </p>

      <OtpInput
        value={code}
        onChange={handleChange}
        length={CODE_LENGTH}
        disabled={loading}
        autoFocus
        digitLabel={(index) => format(messages.digitLabel, { index })}
      />

      {error && <p className="hub-auth__error" role="alert">{error}</p>}
      {info && <p className="hub-auth__info" role="status">{info}</p>}

      <button className="hub-auth__button" type="submit" disabled={loading || code.length !== CODE_LENGTH}>
        {loading ? messages.verifying : messages.verify}
      </button>

      <div className="hub-auth__links">
        <button className="hub-auth__link" type="button" onClick={resetToEmail} disabled={loading}>
          {messages.changeEmail}
        </button>
        <button className="hub-auth__link" type="button" onClick={handleResend} disabled={loading || remaining > 0}>
          {remaining > 0 ? format(messages.resendIn, { seconds: remaining }) : messages.resend}
        </button>
      </div>

      {/* Otp-request risponde allo stesso modo per email sconosciute (anti-enumerazione):
          chi non riceve nulla trova qui la strada della registrazione */}
      {signup && toolConfig?.signup_enabled && (
        <div className="hub-auth__links hub-auth__links--center">
          <button className="hub-auth__link" type="button" onClick={startRegister} disabled={loading}>
            {messages.signupLink}
          </button>
        </div>
      )}
    </form>
  );
}
