/**
 * Primo passo del login: richiesta del codice OTP via email.
 *
 * otp-request risponde 200 anche per email sconosciute (anti-enumerazione):
 * qui non si può distinguere "email non registrata" da "email valida", per design.
 */

import { useState, type FormEvent } from 'react';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';
import { SignupCta } from './SignupCta.js';

export interface EmailStepProps {
  messages?: Partial<HubAuthMessages>;
  /** Mostra il link "Registrati" quando hub offre la registrazione (default true) */
  signup?: boolean;
}

export function EmailStep({ messages: custom, signup = true }: EmailStepProps) {
  const messages = mergeMessages(custom);
  const { requestOtp, toolConfig, loading } = useHubAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  // «Ricordami»: sessione sliding a 30 giorni invece di 48 ore, spenta di default
  const [remember, setRemember] = useState(false);

  /** Handler: invio del form, la validazione dell'email la fa il client */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await requestOtp(email, { remember });
    } catch (err) {
      setError(errorMessage(err, messages, 'email'));
    }
  };

  return (
    <form className="hub-auth__form" onSubmit={handleSubmit} noValidate>
      <label className="hub-auth__label" htmlFor="hub-auth-email">{messages.emailLabel}</label>
      <input
        id="hub-auth-email"
        className="hub-auth__input"
        type="email"
        autoComplete="email"
        placeholder={messages.emailPlaceholder}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        autoFocus
        required
      />

      {error && <p className="hub-auth__error" role="alert">{error}</p>}

      <div className="hub-auth__remember">
        <label className="hub-auth__check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={loading}
            aria-describedby="hub-auth-remember-hint"
          />
          <span>{messages.rememberLabel}</span>
        </label>
        <p id="hub-auth-remember-hint" className="hub-auth__check-hint">{messages.rememberHint}</p>
      </div>

      <button className="hub-auth__button" type="submit" disabled={loading || !email.trim()}>
        {loading ? messages.sending : messages.sendCode}
      </button>

      <p className="hub-auth__hint">{messages.codeHint}</p>

      {signup && toolConfig?.signup_enabled && <SignupCta messages={messages} />}
    </form>
  );
}
