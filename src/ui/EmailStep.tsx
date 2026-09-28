/**
 * Primo passo del login: richiesta del codice OTP via email.
 *
 * otp-request risponde 200 anche per email sconosciute (anti-enumerazione):
 * qui non si può distinguere "email non registrata" da "email valida", per design.
 */

import { useState, type FormEvent } from 'react';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';

export interface EmailStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function EmailStep({ messages: custom }: EmailStepProps) {
  const messages = mergeMessages(custom);
  const { requestOtp, loading } = useHubAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  /** Handler: invio del form, la validazione dell'email la fa il client */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await requestOtp(email);
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

      <button className="hub-auth__button" type="submit" disabled={loading || !email.trim()}>
        {loading ? messages.sending : messages.sendCode}
      </button>

      <p className="hub-auth__hint">{messages.codeHint}</p>
    </form>
  );
}
