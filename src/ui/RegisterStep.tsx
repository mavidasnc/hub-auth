/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, in un box scorrevole,
 * suddiviso in paragrafi dalle righe vuote. La versione del testo mostrato
 * viaggia con la richiesta di registrazione (la gestisce il client).
 */

import { useState, type FormEvent } from 'react';
import { HubAuthError } from '../core/index.js';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';

export interface RegisterStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function RegisterStep({ messages: custom }: RegisterStepProps) {
  const messages = mergeMessages(custom);
  const { register, resetToEmail, toolConfig, loading } = useHubAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  const paragraphs = (toolConfig?.privacy?.text ?? '').split(/\n\s*\n/).filter((p) => p.trim());

  /** Handler: invio del form, la validazione dei campi la fa il client */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await register({ username, email, privacyAccepted: accepted });
    } catch (err) {
      setError(errorMessage(err, messages, 'register'));
      // Con l'informativa aggiornata la spunta data sul testo vecchio non vale più
      if (err instanceof HubAuthError && err.code === 'PrivacyVersionMismatch') setAccepted(false);
    }
  };

  return (
    <form className="hub-auth__form" onSubmit={handleSubmit} noValidate>
      <h2 className="hub-auth__heading">{messages.registerTitle}</h2>

      <label className="hub-auth__label" htmlFor="hub-auth-username">{messages.usernameLabel}</label>
      <input
        id="hub-auth-username"
        className="hub-auth__input"
        type="text"
        autoComplete="name"
        placeholder={messages.usernamePlaceholder}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={loading}
        autoFocus
        required
      />

      <label className="hub-auth__label" htmlFor="hub-auth-register-email">{messages.emailLabel}</label>
      <input
        id="hub-auth-register-email"
        className="hub-auth__input"
        type="email"
        autoComplete="email"
        placeholder={messages.emailPlaceholder}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        required
      />

      {paragraphs.length > 0 && (
        <div className="hub-auth__privacy" tabIndex={0} role="region" aria-label={messages.privacyTitle}>
          {paragraphs.map((text, index) => (
            <p key={index} className="hub-auth__privacy-text">{text}</p>
          ))}
        </div>
      )}

      <label className="hub-auth__check">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={loading}
        />
        <span>{messages.privacyLabel}</span>
      </label>

      {error && <p className="hub-auth__error" role="alert">{error}</p>}

      <button
        className="hub-auth__button"
        type="submit"
        disabled={loading || !username.trim() || !email.trim() || !accepted}
      >
        {loading ? messages.registering : messages.register}
      </button>

      <div className="hub-auth__links hub-auth__links--center">
        <button className="hub-auth__link" type="button" onClick={resetToEmail} disabled={loading}>
          {messages.loginLink}
        </button>
      </div>
    </form>
  );
}
