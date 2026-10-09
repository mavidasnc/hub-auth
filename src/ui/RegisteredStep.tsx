/**
 * Conferma di registrazione con account da approvare: l'utente è in stato
 * "pending" finché un amministratore non lo attiva; lo avvisa una email.
 */

import { useHubAuth } from '../react/index.js';
import { format, mergeMessages, type HubAuthMessages } from './messages.js';

export interface RegisteredStepProps {
  messages?: Partial<HubAuthMessages>;
}

export function RegisteredStep({ messages: custom }: RegisteredStepProps) {
  const messages = mergeMessages(custom);
  const { pendingEmail, resetToEmail } = useHubAuth();

  return (
    <div className="hub-auth__form">
      <h2 className="hub-auth__heading">{messages.registeredTitle}</h2>
      <p className="hub-auth__text" role="status">
        {format(messages.registeredText, { email: pendingEmail })}
      </p>
      <button className="hub-auth__button" type="button" onClick={resetToEmail}>
        {messages.backToLogin}
      </button>
    </div>
  );
}
