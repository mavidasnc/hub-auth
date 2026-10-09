/**
 * Form di registrazione: nome utente, email e accettazione dell'informativa privacy.
 *
 * Il testo dell'informativa arriva da hub (GET /auth/tool-config, modificabile
 * lato hub senza toccare le app): qui viene solo mostrato, per intero, in una
 * modale (dalla 1.5.0) aperta dal link nella frase del consenso o dal pulsante
 * sotto la casella, suddiviso in paragrafi dalle righe vuote. La versione del
 * testo mostrato viaggia con la richiesta di registrazione (la gestisce il client).
 */

import { useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { HubAuthError } from '../core/index.js';
import { useHubAuth } from '../react/index.js';
import { errorMessage, mergeMessages, type HubAuthMessages } from './messages.js';
import { PrivacyDialog } from './PrivacyDialog.js';

export interface RegisterStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function RegisterStep({ messages: custom }: RegisterStepProps) {
  const messages = mergeMessages(custom);
  const { register, resetToEmail, toolConfig, pendingEmail, loading } = useHubAuth();
  const [username, setUsername] = useState('');
  // Chi arriva dal passo del codice ha già scritto l'email: non va riscritta
  const [email, setEmail] = useState(pendingEmail);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // Pulsante che ha aperto la modale: alla chiusura il focus torna lì
  const trigger = useRef<HTMLElement | null>(null);

  const privacy = toolConfig?.privacy;
  const hasPrivacyText = Boolean(privacy?.text.trim());

  // La frase del consenso può contenere {link}: diventa il pulsante dell'informativa
  const labelParts = messages.privacyLabel.split('{link}');

  /** Handler: apre la modale. Dentro la <label> evita che il clic cambi la spunta */
  const openPrivacy = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    trigger.current = event.currentTarget;
    setPrivacyOpen(true);
  };

  /** Handler: chiude la modale e riporta il focus al pulsante che l'ha aperta */
  const closePrivacy = () => {
    setPrivacyOpen(false);
    trigger.current?.focus();
  };

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
    <>
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

      <label className="hub-auth__check">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={loading}
        />
        <span>
          {labelParts.length === 2 ? (
            <>
              {labelParts[0]}
              {hasPrivacyText ? (
                <button className="hub-auth__link hub-auth__link--inline" type="button" onClick={openPrivacy}>
                  {messages.privacyLinkText}
                </button>
              ) : messages.privacyLinkText}
              {labelParts[1]}
            </>
          ) : messages.privacyLabel}
        </span>
      </label>

      {hasPrivacyText && (
        <button className="hub-auth__link hub-auth__link--block" type="button" onClick={openPrivacy}>
          {messages.privacyOpen}
        </button>
      )}

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

    {privacyOpen && (
      <PrivacyDialog
        messages={messages}
        text={privacy?.text ?? ''}
        format={privacy?.format}
        onClose={closePrivacy}
        onAccept={() => { setAccepted(true); closePrivacy(); }}
      />
    )}
    </>
  );
}
